// Konteks satu run: log & event (runs/<runId>.jsonl), pembatalan, rahasia, konfigurasi, dan browser bersama.
// `forJob()` membuat konteks per job: log diberi label job; pada run paralel tiap job memakai browser context sendiri
// (cookie/sesi login & folder unduhan terpisah) sehingga job yang berjalan bersamaan tidak saling mengganggu.
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type BrowserContext, type CDPSession, type Page } from "puppeteer-core";
import { redact } from "~/shared/catalog";
import type { Config, JobId, RunEvent, Secrets } from "~/shared/types";
import { findBrowser } from "~/core/browser";
import { P } from "~/core/paths";

export class CancelledError extends Error {
  constructor() { super("Dibatalkan pengguna."); }
}

/** Status bersama satu run (dipakai semua konteks job). */
type Shared = {
  cancelled: boolean;
  timer: NodeJS.Timeout;
  browser: Browser | null;
  launching: Promise<Browser> | null;
  onCancel: (() => void)[];
};

export class RunContext {
  readonly eventsFile: string;
  readonly cancelFile: string;
  /** Job pemilik konteks ini (label log). */
  job: JobId | undefined;
  /** true = job memakai browser context sendiri (run paralel). */
  readonly isolated: boolean;
  /** Konteks run induk (dirinya sendiri untuk konteks run). */
  readonly root: RunContext;
  private shared: Shared;
  private browserCtx: BrowserContext | null = null;
  private dlSession: CDPSession | null = null;
  private pages: Page[] = [];

  constructor(readonly runId: string, readonly config: Config, readonly secrets: Secrets, readonly opts: { dryRun: boolean; force: boolean },
    parent?: RunContext, job?: JobId, isolated = false) {
    this.eventsFile = path.join(P.runs, `${runId}.jsonl`);
    this.cancelFile = path.join(P.runs, `${runId}.cancel`);
    this.root = parent?.root ?? this;
    this.job = job;
    this.isolated = isolated;
    if (parent) { this.shared = parent.shared; return; }
    this.shared = { cancelled: false, browser: null, launching: null, onCancel: [], timer: setInterval(() => this.pollCancel(), 700) };
  }

  /** Konteks untuk satu job. `isolated` = browser context sendiri (run paralel). */
  forJob(job: JobId, isolated: boolean) {
    return new RunContext(this.runId, this.config, this.secrets, this.opts, this, job, isolated);
  }

  private pollCancel() {
    const s = this.shared;
    if (s.cancelled || !fs.existsSync(this.cancelFile)) return;
    s.cancelled = true;
    this.job = undefined;
    this.log("warn", "Permintaan berhenti diterima — menutup browser…");
    for (const f of s.onCancel) { try { f(); } catch { /* abaikan */ } }
    void this.closeBrowser();
  }

  emit(e: RunEvent) {
    fs.appendFileSync(this.eventsFile, JSON.stringify(e) + "\n");
  }

  log(level: "info" | "warn" | "error" | "ok", msg: string) {
    const clean = redact(msg, Object.values(this.secrets));
    this.emit({ t: "log", at: new Date().toISOString(), level, msg: clean, job: this.job });
    if (process.stdout.isTTY) console.log(clean);
  }
  info = (m: string) => this.log("info", m);
  warn = (m: string) => this.log("warn", m);

  get isCancelled() { return this.shared.cancelled; }
  check() { if (this.shared.cancelled) throw new CancelledError(); }
  whenCancelled(f: () => void) { this.shared.onCancel.push(f); }

  secret(k: keyof Secrets & string, label: string) {
    const v = this.secrets[k as keyof Secrets];
    if (!v) throw new Error(`${label} belum diisi di Pengaturan.`);
    return v;
  }

  /** Browser bersama untuk semua job dalam satu run (diluncurkan sekali walau diminta bersamaan). */
  async getBrowser(): Promise<Browser> {
    this.check();
    const s = this.shared;
    if (s.browser?.connected) return s.browser;
    if (!s.launching) {
      s.launching = (async () => {
        const b = findBrowser(this.config.browser.channel);
        if (!b) throw new Error("Microsoft Edge / Google Chrome tidak ditemukan di PC ini.");
        const browser = await puppeteer.launch({
          executablePath: b.path,
          headless: this.config.browser.headless,
          defaultViewport: { width: 1440, height: 900 },
          args: ["--window-size=1440,900", "--no-first-run", "--no-default-browser-check", "--disable-popup-blocking"],
        });
        this.root.info(`Browser: ${b.name}${this.config.browser.headless ? " (tanpa tampilan)" : ""}`);
        s.browser = browser;
        return browser;
      })().finally(() => { s.launching = null; });
    }
    return s.launching;
  }

  async newPage(): Promise<Page> {
    const browser = await this.getBrowser();
    if (this.isolated && !this.browserCtx) this.browserCtx = await browser.createBrowserContext();
    const page = await (this.browserCtx ?? browser).newPage();
    this.pages.push(page);
    // CSP Jaspersoft memblokir `new Function` yang dipakai waitForFunction → tanpa ini semua penantian timeout.
    await page.setBypassCSP(true);
    page.setDefaultTimeout(60_000);
    return page;
  }

  /** Arahkan unduhan halaman ke `dir` (browser context terpisah memakai perintah tingkat browser). */
  async allowDownloads(page: Page, dir: string) {
    if (this.browserCtx) {
      // Sesi CDP harus tetap terbuka: pengaturan unduhan hilang bila sesinya dilepas (ditutup di closeJob).
      this.dlSession ??= await page.browser().target().createCDPSession();
      await this.dlSession.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dir, browserContextId: this.browserCtx.id });
      return;
    }
    const cdp = await page.createCDPSession();
    await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dir });
  }

  /** Tutup halaman & browser context milik job ini (job lain di run paralel tidak terganggu). */
  async closeJob() {
    const pages = this.pages.splice(0);
    for (const p of pages) await p.close().catch(() => {});
    const bc = this.browserCtx;
    this.browserCtx = null;
    if (bc) await bc.close().catch(() => {});
    const s = this.dlSession;
    this.dlSession = null;
    if (s) await s.detach().catch(() => {});
  }

  async closeBrowser() {
    const s = this.shared;
    const b = s.browser;
    s.browser = null;
    if (b) await b.close().catch(() => {});
  }

  /** Simpan screenshot + HTML halaman untuk diagnosis; mengembalikan nama file screenshot. */
  async diagnose(page: Page | null, job: string) {
    if (!page || page.isClosed()) return undefined;
    fs.mkdirSync(P.shots, { recursive: true });
    const base = path.join(P.shots, `${this.runId}-${job.replace(/\W+/g, "_")}`);
    await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
    const html = await page.content().catch(() => "");
    if (html) fs.writeFileSync(`${base}.html`, html);
    return fs.existsSync(`${base}.png`) ? path.basename(`${base}.png`) : undefined;
  }

  async dispose() {
    clearInterval(this.shared.timer);
    await this.closeBrowser();
    try { fs.rmSync(this.cancelFile); } catch { /* tidak ada */ }
  }
}

export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

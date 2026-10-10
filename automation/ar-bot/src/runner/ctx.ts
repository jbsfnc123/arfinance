// Konteks satu run: log & event (runs/<runId>.jsonl), pembatalan, rahasia, konfigurasi, dan browser bersama.
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { redact } from "~/shared/catalog";
import type { Config, JobId, RunEvent, Secrets } from "~/shared/types";
import { findBrowser } from "~/core/browser";
import { P } from "~/core/paths";

export class CancelledError extends Error {
  constructor() { super("Dibatalkan pengguna."); }
}

export class RunContext {
  readonly eventsFile: string;
  readonly cancelFile: string;
  private cancelled = false;
  private timer: NodeJS.Timeout;
  private browser: Browser | null = null;
  job: JobId | undefined;
  /** Dipanggil saat pembatalan agar operasi browser yang sedang menunggu langsung berhenti. */
  private onCancel: (() => void)[] = [];

  constructor(readonly runId: string, readonly config: Config, readonly secrets: Secrets, readonly opts: { dryRun: boolean; force: boolean }) {
    this.eventsFile = path.join(P.runs, `${runId}.jsonl`);
    this.cancelFile = path.join(P.runs, `${runId}.cancel`);
    this.timer = setInterval(() => {
      if (!this.cancelled && fs.existsSync(this.cancelFile)) {
        this.cancelled = true;
        this.log("warn", "Permintaan berhenti diterima — menutup browser…");
        for (const f of this.onCancel) { try { f(); } catch { /* abaikan */ } }
        void this.closeBrowser();
      }
    }, 700);
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

  get isCancelled() { return this.cancelled; }
  check() { if (this.cancelled) throw new CancelledError(); }
  whenCancelled(f: () => void) { this.onCancel.push(f); }

  secret(k: keyof Secrets & string, label: string) {
    const v = this.secrets[k as keyof Secrets];
    if (!v) throw new Error(`${label} belum diisi di Pengaturan.`);
    return v;
  }

  /** Browser bersama untuk semua job dalam satu run (Jaspersoft cukup login sekali). */
  async getBrowser(): Promise<Browser> {
    this.check();
    if (this.browser?.connected) return this.browser;
    const b = findBrowser(this.config.browser.channel);
    if (!b) throw new Error("Microsoft Edge / Google Chrome tidak ditemukan di PC ini.");
    this.browser = await puppeteer.launch({
      executablePath: b.path,
      headless: this.config.browser.headless,
      defaultViewport: { width: 1440, height: 900 },
      args: ["--window-size=1440,900", "--no-first-run", "--no-default-browser-check", "--disable-popup-blocking"],
    });
    this.info(`Browser: ${b.name}${this.config.browser.headless ? " (tanpa tampilan)" : ""}`);
    return this.browser;
  }

  async newPage(): Promise<Page> {
    const page = await (await this.getBrowser()).newPage();
    // CSP Jaspersoft memblokir `new Function` yang dipakai waitForFunction → tanpa ini semua penantian timeout.
    await page.setBypassCSP(true);
    page.setDefaultTimeout(60_000);
    return page;
  }

  async closeBrowser() {
    const b = this.browser;
    this.browser = null;
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
    clearInterval(this.timer);
    await this.closeBrowser();
    try { fs.rmSync(this.cancelFile); } catch { /* tidak ada */ }
  }
}

export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Sesi Jaspersoft (report.tangki.id). Langkah & selector dari bot_jaspersoft.js milik user, disempurnakan di Bot ERP
// (uji nyata 2026-10-09). Satu sesi login dipakai bersama oleh semua laporan dalam satu run.
//
// PENTING: kode yang dijalankan di browser (evaluate/waitForFunction/$eval) TIDAK boleh berisi fungsi bernama:
// bundler bisa membungkusnya dengan __name() yang tidak ada di halaman → ReferenceError. Pakai callback anonim saja.
import fs from "node:fs";
import path from "node:path";
import type { Page } from "puppeteer-core";
import { delay, type RunContext } from "~/runner/ctx";
import { waitDownload } from "~/runner/download";

const LOGIN_URL = "https://report.tangki.id/jasperserver/login.html";
const LOADERS = ["#loading", ".dimmer", "#exportLoadingIndicator"];
const EMPTY_REPORT = "report is empty|laporan kosong|no data|tidak ada data";

export class JasperSession {
  private page: Page | null = null;
  stage = "Login";

  constructor(private ctx: RunContext) {}

  get currentPage() { return this.page; }

  /** Halaman yang sudah login (login sekali per run). */
  async ready(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    const { ctx } = this;
    const user = ctx.config.jasper.username;
    if (!user) throw new Error("Username Jaspersoft belum diisi di Pengaturan.");
    const pass = ctx.secret("jasperPassword", "Password Jaspersoft");
    this.stage = "Login";
    const page = await ctx.newPage();
    this.page = page;
    ctx.info("Login Jaspersoft…");
    await page.goto(LOGIN_URL, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForSelector("#j_username", { timeout: 15_000 });
    await page.type("#j_username", user);
    await page.type("#j_password_pseudo", pass);
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60_000 }), page.click("#submitButton")]);
    if (await page.$("#j_username")) throw new Error("Login Jaspersoft gagal (periksa username/password di Pengaturan).");
    return page;
  }

  async waitForLoading(timeoutMs = 60_000) {
    const page = this.page!;
    await delay(500);
    await page.waitForFunction((sels: string[]) => sels.every((s) => {
      const el = document.querySelector<HTMLElement>(s);
      return !el || el.classList.contains("hidden") || el.style.display === "none";
    }), { timeout: timeoutMs }, LOADERS).catch((e: Error) => this.ctx.info(`  (indikator loading: ${e.message.split("\n")[0]}, lanjut)`));
    await delay(800);
  }

  async scrollTo(sel: string) {
    await this.page!.evaluate((s) => document.querySelector(s)?.scrollIntoView({ behavior: "instant", block: "center" }), sel);
    await delay(400);
  }

  /** Library → buka laporan (bila tidak terlihat, cari lewat kotak pencarian) → tunggu Input Controls. */
  async openReport(name: string, search = name) {
    const page = await this.ready();
    this.ctx.check();
    this.stage = "Buka laporan";
    this.ctx.info(`Library › ${name}…`);
    await page.waitForSelector("#main_library", { visible: true, timeout: 20_000 });
    await page.click("#main_library");
    const link = `a::-p-text(${name})`;
    let visible = await page.waitForSelector(link, { visible: true, timeout: 20_000 }).then(() => true, () => false);
    if (!visible) {
      await page.click("#searchInput", { clickCount: 3 }).catch(() => {});
      await page.type("#searchInput", search, { delay: 40 }).catch(() => {});
      await page.keyboard.press("Enter");
      visible = await page.waitForSelector(link, { visible: true, timeout: 20_000 }).then(() => true, () => false);
    }
    if (!visible) throw new Error(`laporan "${name}" tidak ditemukan di Library`);
    // Daftar Library dirender ulang setelah pencarian → elemen lama bisa "detached". Tunggu tenang, ambil ulang, coba lagi.
    for (let i = 1; ; i++) {
      await delay(1500);
      const el = await page.waitForSelector(link, { visible: true, timeout: 10_000 });
      try {
        await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60_000 }), el!.click()]);
        break;
      } catch (e) {
        if (i >= 3 || !/detached|not clickable|navigation/i.test((e as Error).message)) throw e;
      }
    }
    this.stage = "Input Controls";
    await page.waitForSelector("#inputControls", { visible: true, timeout: 30_000 });
    await this.waitForLoading();
  }

  /** Isi input tanggal di kontrol `#<controlId>` (YYYY-MM-DD) dan pastikan terisi. */
  async setDate(controlId: string, iso: string, label: string) {
    const page = this.page!;
    await this.scrollTo(`#${controlId}`);
    const input = await page.$(`#${controlId} input`);
    if (!input) throw new Error(`kolom ${label} (#${controlId}) tidak ditemukan`);
    const current = await input.evaluate((el) => (el as HTMLInputElement).value);
    if (!current.includes(iso)) {
      await input.click({ clickCount: 3 });
      await page.keyboard.press("Backspace");
      await input.type(iso);
      await page.keyboard.press("Tab");
      await delay(500);
    }
    const set = await input.evaluate((el) => (el as HTMLInputElement).value);
    if (!set.includes(iso)) throw new Error(`${label} tidak terisi (terbaca: "${set}")`);
  }

  /**
   * Organization pada kontrol pertama yang ada di `controlIds`: buka dropdown → ketik untuk menyaring → klik item yang
   * cocok. (ArrowDown+Enter memilih "*" karena daftar diawali "---" dan "*".)
   */
  async pickOrganization(controlIds: string[]) {
    const page = this.page!;
    const org = this.ctx.config.jasper.organization || "Penguin Trading";
    let id: string | null = null;
    for (const c of controlIds) if (await page.$(`#${c} a.jr-mSingleselect-input`)) { id = c; break; }
    if (!id) throw new Error(`kontrol Organization tidak ditemukan (${controlIds.map((c) => "#" + c).join(", ")})`);
    await this.scrollTo(`#${id}`);
    await page.click(`#${id} a.jr-mSingleselect-input`);
    await delay(800);
    await (await page.$(`#${id} input.jr-mInput-search`))?.focus();
    await page.keyboard.type(org, { delay: 60 });
    let picked = false;
    for (let i = 0; i < 15 && !picked; i++) {
      await delay(1000);
      for (const li of await page.$$("li.jr-mSelectlist-item")) {
        const txt = await li.evaluate((e) => (e.checkVisibility() ? e.textContent?.trim() ?? "" : ""));
        if (txt.toLowerCase().includes(org.toLowerCase())) { await li.click(); picked = true; break; }
      }
    }
    if (!picked) throw new Error(`Organization "${org}" tidak ada di daftar.`);
    await this.waitForLoading();
    const got = await page.$eval(`#${id} .jr-mSingleselect-input-selection`, (el) => el.textContent ?? "").catch(() => "");
    if (!got.includes(org)) throw new Error(`Organization tidak terpilih (terbaca: "${got.trim()}").`);
    return org;
  }

  /** Pilih opsi berteks `text` pada dropdown tunggal `#<controlId>` (mis. Tipe Transaksi / Status = Piutang). */
  async pickOption(controlId: string, text: string, label: string) {
    const page = this.page!;
    await this.scrollTo(`#${controlId}`);
    const current = () => page.$eval(`#${controlId} .jr-mSingleselect-input-selection`, (el) => el.textContent ?? "").catch(() => "");
    if ((await current()).includes(text)) return;
    // Cara 1: klik item yang terlihat di daftar dropdown (berhasil untuk Tipe Transaksi Aging).
    await page.click(`#${controlId} a.jr-mSingleselect-input`);
    await delay(800);
    await page.evaluate((t: string) => {
      const item = [...document.querySelectorAll<HTMLElement>("li.jr-mSelectlist-item")]
        .find((el) => el.checkVisibility() && (el.title || el.textContent || "").includes(t));
      if (!item) return;
      (item.querySelector("a") ?? item).click();
      for (const ev of ["mousedown", "mouseup", "click"]) item.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true }));
    }, text);
    await this.waitForLoading();
    // Cara 2 (bot lama Invoice by Date): buka dropdown, panah bawah n kali, Enter — sampai pilihan cocok.
    for (let n = 1; n <= 6 && !(await current()).includes(text); n++) {
      await page.click(`#${controlId} a.jr-mSingleselect-input`);
      await delay(600);
      for (let k = 0; k < n; k++) { await page.keyboard.press("ArrowDown"); await delay(250); }
      await page.keyboard.press("Enter");
      await delay(800);
      await this.waitForLoading(30_000);
    }
    if (!(await current()).includes(text)) throw new Error(`${label} ${text} tidak terpilih (terbaca "${(await current()).trim()}").`);
  }

  /** Apply → tunggu laporan selesai. false bila laporan kosong. */
  async applyAndWait() {
    const page = this.page!;
    this.ctx.check();
    this.stage = "Generate laporan";
    this.ctx.info("Apply & tunggu laporan…");
    await this.scrollTo("#apply");
    await page.waitForSelector("#apply", { visible: true, timeout: 10_000 });
    await page.click("#apply").catch(() => {});
    await delay(300);
    await page.evaluate(() => {
      const btn = document.querySelector<HTMLElement>("#apply");
      // Tombol Apply kadang tidak bereaksi pada satu klik → rangkaian event lengkap (seperti bot lama).
      if (btn && document.querySelector("#inputControls")?.checkVisibility?.()) {
        for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) btn.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
      }
    });
    await delay(2000);
    await page.waitForFunction((emptyRe: string) => {
      const idle = ["#loading", "#exportLoadingIndicator"].every((s) => {
        const el = document.querySelector<HTMLElement>(s);
        return !el || el.classList.contains("hidden") || el.style.display === "none";
      });
      const exp = document.querySelector<HTMLButtonElement>("#export");
      const ready = !!exp && !exp.disabled && !exp.hasAttribute("disabled");
      const empty = new RegExp(emptyRe, "i").test(document.querySelector("#reportContainer, #reportViewFrame, .body")?.textContent ?? "");
      return idle && (document.querySelector("table.jrPage") !== null || ready || empty);
    }, { timeout: 600_000 }, EMPTY_REPORT);
    const hasPage = await page.evaluate(() => document.querySelector("table.jrPage") !== null);
    const empty = !hasPage && await page.evaluate((emptyRe: string) =>
      new RegExp(emptyRe, "i").test(document.querySelector("#reportContainer, #reportViewFrame, .body")?.textContent ?? ""), EMPTY_REPORT);
    this.ctx.info(empty ? "Laporan kosong." : "Laporan selesai digenerate.");
    return !empty;
  }

  /** Arahkan kursor & klik Export → klik blok `p.wrap.button` berteks persis `label` (sekali) → tunggu file di `dir`. */
  async exportAs(dir: string, label: "Excel" | "CSV", ext: RegExp) {
    const page = this.page!;
    this.ctx.check();
    this.stage = `Export › ${label}`;
    this.ctx.info(`Export › ${label}…`);
    const cdp = await page.createCDPSession();
    await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dir });
    await page.waitForFunction(() => {
      const b = document.querySelector<HTMLButtonElement>("#export");
      return !!b && !b.disabled && !b.hasAttribute("disabled");
    }, { timeout: 30_000 });
    const before = new Set(fs.readdirSync(dir));
    const item = `::-p-xpath(//p[contains(@class,'wrap') and contains(@class,'button')][normalize-space()='${label}'])`;
    let btn = null;
    for (let i = 0; i < 3 && !btn; i++) {
      await page.hover("#export");
      await page.click("#export");
      btn = await page.waitForSelector(item, { visible: true, timeout: 10_000 }).catch(() => null);
    }
    if (!btn) throw new Error(`menu Export tidak menampilkan pilihan ${label}`);
    await btn.click(); // TEPAT satu klik (klik ganda = dua file)
    this.stage = "Unduh file";
    const file = await waitDownload(this.ctx, dir, before, ext, 240);
    if (!file) throw new Error(`file ${label} tidak terunduh dalam 4 menit`);
    return file;
  }
}

const stamp = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "medium" })
  .format(new Date()).replace(/:/g, "");

/** Beri nama file akhir "<prefix> <tanggal jam>.<ext>". */
export function finalize(ctx: RunContext, file: string, prefix: string) {
  const finalPath = path.join(path.dirname(file), `${prefix} ${stamp()}${path.extname(file)}`);
  fs.renameSync(file, finalPath);
  ctx.info(`Terunduh: ${path.basename(finalPath)} (${(fs.statSync(finalPath).size / 1024).toFixed(0)} KB)`);
  return finalPath;
}

/** Tanggal ISO `iso` digeser `days` hari. */
export function shiftDate(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

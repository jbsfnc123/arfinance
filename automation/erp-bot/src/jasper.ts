// Unduh laporan dari Jaspersoft (report.tangki.id): "Aging Detail" (Excel) & "Send Invoice To Customer" (CSV).
// Langkah & selector berasal dari bot_jaspersoft.js / bot_send_invoice.js milik user, disesuaikan setelah uji nyata
// 2026-10-09: headless untuk Task Scheduler, deteksi file baru yang benar, browser selalu ditutup, bahan diagnosis bila gagal.
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer";
import { todayJakarta } from "@/lib/parsers/date";
import { log } from "./log";

const LOGIN_URL = "https://report.tangki.id/jasperserver/login.html";
const ORGANIZATION = "Penguin Trading";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type JasperOptions = { downloadDir: string; logDir: string; headless: boolean; username: string; password: string };
type Stage = (name: string) => void;

// PENTING: kode yang dijalankan di browser (evaluate/waitForFunction/$eval) TIDAK boleh berisi fungsi bernama
// (`const f = () => …` / `function f`): tsx (esbuild keepNames) membungkusnya dengan __name() yang tidak ada di halaman
// → ReferenceError dan penantian selalu gagal. Pakai callback anonim saja.
const LOADERS = ["#loading", ".dimmer", "#exportLoadingIndicator"];
const EMPTY_REPORT = "report is empty|laporan kosong|no data|tidak ada data";

// Tunggu indikator loading / dimmer Jaspersoft hilang.
async function waitForLoading(page: Page, timeoutMs = 60_000) {
  await delay(500);
  await page.waitForFunction((sels: string[]) => sels.every((s) => {
    const el = document.querySelector<HTMLElement>(s);
    return !el || el.classList.contains("hidden") || el.style.display === "none";
  }), { timeout: timeoutMs }, LOADERS).catch((e: Error) => log(`  (indikator loading: ${e.message.split("\n")[0]}, lanjut)`));
  await delay(800);
}

async function scrollTo(page: Page, sel: string) {
  await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ behavior: "instant", block: "center" }), sel);
  await delay(400);
}

const stamp = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "short" })
  .format(new Date()).replace(":", "");

/** Buka browser, login, jalankan `fn`; browser selalu ditutup. Galat diberi label tahap + screenshot & HTML. */
async function withSession<T>(opt: JasperOptions, fn: (page: Page, stage: Stage) => Promise<T>): Promise<T> {
  fs.mkdirSync(opt.downloadDir, { recursive: true });
  const browser = await puppeteer.launch({ headless: opt.headless, defaultViewport: { width: 1440, height: 900 }, args: ["--window-size=1440,900"] });
  const page = await browser.newPage();
  let current = "Login";
  const stage: Stage = (name) => { current = name; };
  // CSP Jaspersoft memblokir `new Function` yang dipakai waitForFunction → tanpa ini semua penantian timeout.
  await page.setBypassCSP(true);
  try {
    const cdp = await page.createCDPSession();
    await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: opt.downloadDir });
    log("1. Login Jaspersoft…");
    await page.goto(LOGIN_URL, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForSelector("#j_username", { timeout: 15_000 });
    await page.type("#j_username", opt.username);
    await page.type("#j_password_pseudo", opt.password);
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60_000 }), page.click("#submitButton")]);
    if (await page.$("#j_username")) throw new Error("Login Jaspersoft gagal (periksa JASPER_USERNAME/JASPER_PASSWORD).");
    return await fn(page, stage);
  } catch (e) {
    fs.mkdirSync(opt.logDir, { recursive: true });
    const base = path.join(opt.logDir, `error-${Date.now()}`);
    await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
    const html = await page.content().catch(() => "");
    if (html) fs.writeFileSync(`${base}.html`, html);
    log(`   Bahan diagnosis: ${base}.png / .html`);
    throw new Error(`${current}: ${(e as Error).message}`);
  } finally {
    await browser.close();
  }
}

/** Library → buka laporan (bila tidak terlihat, cari lewat kotak pencarian Library) → tunggu Input Controls. */
async function openReport(page: Page, stage: Stage, name: string) {
  stage("Buka laporan");
  log(`2. Library › ${name}…`);
  await page.waitForSelector("#main_library", { visible: true, timeout: 20_000 });
  await page.click("#main_library");
  const link = `a::-p-text(${name})`;
  let visible = await page.waitForSelector(link, { visible: true, timeout: 20_000 }).then(() => true, () => false);
  if (!visible) {
    // Tidak tampil di halaman Library → cari lewat kotak pencarian (mis. "Report Send Invoice To Customer").
    await page.click("#searchInput", { clickCount: 3 }).catch(() => {});
    await page.type("#searchInput", name, { delay: 40 }).catch(() => {});
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
  stage("Input Controls");
  log("3. Input Controls…");
  await page.waitForSelector("#inputControls", { visible: true, timeout: 30_000 });
  await waitForLoading(page);
}

/** Isi input tanggal di kontrol `#<controlId>` (format YYYY-MM-DD) dan pastikan terisi. */
async function setDate(page: Page, controlId: string, iso: string, label: string) {
  await scrollTo(page, `#${controlId}`);
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

/** Apply → tunggu laporan selesai. Mengembalikan false bila laporan kosong. */
async function applyAndWait(page: Page, stage: Stage) {
  stage("Generate laporan");
  log("4. Apply & tunggu laporan…");
  await scrollTo(page, "#apply");
  await page.waitForSelector("#apply", { visible: true, timeout: 10_000 });
  await page.click("#apply").catch(() => {});
  await delay(300);
  await page.evaluate(() => {
    const btn = document.querySelector<HTMLElement>("#apply");
    // Tombol Apply Jaspersoft kadang tidak bereaksi pada satu klik → kirim rangkaian event lengkap (seperti bot lama).
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
  log(empty ? "   Laporan kosong." : "   Laporan selesai digenerate.");
  return !empty;
}

/** Seperti manual: arahkan kursor & klik Export → klik blok `p.wrap.button` berteks persis `label` (sekali) → tunggu file. */
async function exportAs(page: Page, stage: Stage, dir: string, label: "Excel" | "CSV", ext: RegExp) {
  stage(`Export › ${label}`);
  log(`5. Export › ${label}…`);
  await page.waitForFunction(() => {
    const b = document.querySelector<HTMLButtonElement>("#export");
    return !!b && !b.disabled && !b.hasAttribute("disabled");
  }, { timeout: 30_000 });
  const before = new Set(fs.readdirSync(dir));
  // Teks persis (mis. "CSV", bukan "CSV Metadata"); dialog Input Controls boleh tetap terbuka.
  const item = `::-p-xpath(//p[contains(@class,'wrap') and contains(@class,'button')][normalize-space()='${label}'])`;
  let btn = null;
  for (let i = 0; i < 3 && !btn; i++) {
    await page.hover("#export");
    await page.click("#export");
    btn = await page.waitForSelector(item, { visible: true, timeout: 10_000 }).catch(() => null);
  }
  if (!btn) throw new Error(`menu Export tidak menampilkan pilihan ${label}`);
  await btn.click(); // TEPAT satu klik (klik ganda = dua file)
  stage("Unduh file");
  let file: string | null = null;
  for (let s = 0; s < 180 && !file; s++) {
    await delay(1000);
    const all = fs.readdirSync(dir);
    if (all.some((f) => f.endsWith(".crdownload"))) continue;
    file = all.filter((f) => ext.test(f) && !before.has(f)).at(-1) ?? null;
  }
  if (!file) throw new Error(`file ${label} tidak terunduh dalam 3 menit`);
  return path.join(dir, file);
}

/**
 * Organization = PT. Penguin Trading pada kontrol pertama yang ada di `controlIds`: buka dropdown → ketik untuk
 * menyaring → klik item yang cocok. (ArrowDown+Enter memilih "*" karena daftar diawali "---" dan "*".)
 */
async function pickOrganization(page: Page, controlIds: string[]) {
  let id: string | null = null;
  for (const c of controlIds) if (await page.$(`#${c} a.jr-mSingleselect-input`)) { id = c; break; }
  if (!id) throw new Error(`kontrol Organization tidak ditemukan (${controlIds.map((c) => "#" + c).join(", ")})`);
  await scrollTo(page, `#${id}`);
  await page.waitForSelector(`#${id} a.jr-mSingleselect-input`, { visible: true, timeout: 10_000 });
  await page.click(`#${id} a.jr-mSingleselect-input`);
  await delay(800);
  await (await page.$(`#${id} input.jr-mInput-search`))?.focus();
  await page.keyboard.type(ORGANIZATION, { delay: 60 });
  let picked = false;
  for (let i = 0; i < 15 && !picked; i++) {
    await delay(1000);
    for (const li of await page.$$("li.jr-mSelectlist-item")) {
      const txt = await li.evaluate((e) => (e.checkVisibility() ? e.textContent?.trim() ?? "" : ""));
      if (txt.toLowerCase().includes(ORGANIZATION.toLowerCase())) { await li.click(); picked = true; break; }
    }
  }
  if (!picked) throw new Error(`Organization "${ORGANIZATION}" tidak ada di daftar.`);
  await waitForLoading(page);
  const org = await page.$eval(`#${id} .jr-mSingleselect-input-selection`, (el) => el.textContent ?? "").catch(() => "");
  if (!org.includes(ORGANIZATION)) throw new Error(`Organization tidak terpilih (terbaca: "${org.trim()}").`);
}

/** Tanggal ISO `iso` digeser `days` hari (kalender, tanpa zona waktu). */
export function shiftDate(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function finalize(file: string, prefix: string) {
  const finalPath = path.join(path.dirname(file), `${prefix} ${stamp()}${path.extname(file)}`);
  fs.renameSync(file, finalPath);
  log(`   Terunduh: ${path.basename(finalPath)} (${(fs.statSync(finalPath).size / 1024).toFixed(0)} KB)`);
  return finalPath;
}

/** Aging Detail (Organization Penguin Trading, Statement Date hari ini, Piutang) → Excel. */
export async function downloadAgingDetail(opt: JasperOptions) {
  return withSession(opt, async (page, stage) => {
    await openReport(page, stage, "Aging Detail");

    await pickOrganization(page, ["AD_Org_ID"]);

    const today = todayJakarta();
    await setDate(page, "statementdate", today, "Statement Date");
    await waitForLoading(page);

    // Tipe Transaksi = Piutang.
    await scrollTo(page, "#isSOtrx");
    const tipe = () => page.$eval("#isSOtrx .jr-mSingleselect-input-selection", (el) => el.textContent ?? "").catch(() => "");
    if (!(await tipe()).includes("Piutang")) {
      await page.click("#isSOtrx a.jr-mSingleselect-input");
      await delay(800);
      await page.evaluate(() => {
        const item = [...document.querySelectorAll<HTMLElement>("li.jr-mSelectlist-item")].find((el) => (el.title || el.textContent || "").includes("Piutang"));
        if (!item) return;
        (item.querySelector("a") ?? item).click();
        for (const t of ["mousedown", "mouseup", "click"]) item.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }));
      });
      await waitForLoading(page);
      if (!(await tipe()).includes("Piutang")) throw new Error("Tipe Transaksi Piutang tidak terpilih.");
    }
    log(`   Organization ${ORGANIZATION} · Statement Date ${today} · Piutang`);

    if (!(await applyAndWait(page, stage))) throw new Error("laporan Aging kosong");
    return finalize(await exportAs(page, stage, opt.downloadDir, "Excel", /\.xlsx?$/i), "Aging Detail");
  });
}

/** Send Invoice To Customer (Tanggal Awal = Tanggal Akhir = hari ini) → CSV. `null` bila tidak ada jadwal hari ini. */
export async function downloadSendInvoice(opt: JasperOptions) {
  return withSession(opt, async (page, stage) => {
    await openReport(page, stage, "Send Invoice To Customer");
    const today = todayJakarta();
    await setDate(page, "whenStart", today, "Tanggal Awal");
    await setDate(page, "whenEnd", today, "Tanggal Akhir");
    await waitForLoading(page);
    log(`   Tanggal Awal ${today} · Tanggal Akhir ${today}`);
    if (!(await applyAndWait(page, stage))) return null;
    return finalize(await exportAs(page, stage, opt.downloadDir, "CSV", /\.csv$/i), "Send Invoice");
  });
}

/**
 * Laporan Serah Terima Surat Jalan By Send Date (Start Date = hari ini − 6, End Date = hari ini, Organization Penguin
 * Trading) → CSV. `null` bila laporan kosong. Rentang 7 hari menangkap penerimaan yang tercatat terlambat.
 */
export async function downloadSerahTerimaSj(opt: JasperOptions) {
  return withSession(opt, async (page, stage) => {
    await openReport(page, stage, "Laporan Serah Terima Surat Jalan By Send Date");
    const today = todayJakarta();
    const from = shiftDate(today, -6);
    await setDate(page, "StartDate", from, "Start Date");
    await setDate(page, "EndDate", today, "End Date");
    await waitForLoading(page);
    await pickOrganization(page, ["Organization", "AD_Org_ID"]);
    log(`   Start Date ${from} · End Date ${today} · Organization ${ORGANIZATION}`);
    if (!(await applyAndWait(page, stage))) return null;
    return finalize(await exportAs(page, stage, opt.downloadDir, "CSV", /\.csv$/i), "Serah Terima SJ");
  });
}

// Unduh laporan "Aging Detail" dari Jaspersoft (report.tangki.id). Langkah & selector diambil dari bot_jaspersoft.js
// yang sudah terbukti jalan; perbedaannya: headless untuk Task Scheduler, deteksi file baru yang benar, browser selalu
// ditutup, dan screenshot bila gagal.
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer";
import { todayJakarta } from "@/lib/parsers/date";
import { log } from "./log";

const LOGIN_URL = "https://report.tangki.id/jasperserver/login.html";
const ORGANIZATION = "Penguin Trading";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isExcel = (f: string) => /\.(xlsx?|XLSX?)$/.test(f);

// PENTING: kode yang dijalankan di browser (evaluate/waitForFunction/$eval) TIDAK boleh berisi fungsi bernama
// (`const f = () => …` / `function f`): tsx (esbuild keepNames) membungkusnya dengan __name() yang tidak ada di halaman
// → ReferenceError dan penantian selalu gagal. Pakai callback anonim saja.
const LOADERS = ["#loading", ".dimmer", "#exportLoadingIndicator"];

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

/** Jalankan laporan & unduh Excel. Mengembalikan path file di `downloadDir`. */
export async function downloadAgingDetail(opt: { downloadDir: string; logDir: string; headless: boolean; username: string; password: string }) {
  fs.mkdirSync(opt.downloadDir, { recursive: true });
  const browser = await puppeteer.launch({ headless: opt.headless, defaultViewport: { width: 1440, height: 900 }, args: ["--window-size=1440,900"] });
  const page = await browser.newPage();
  let stage = "Login";
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

    stage = "Buka laporan";
    log("2. Library › Aging Detail…");
    await page.waitForSelector("#main_library", { visible: true, timeout: 20_000 });
    await page.click("#main_library");
    const link = "a::-p-text(Aging Detail)";
    await page.waitForSelector(link, { visible: true, timeout: 20_000 });
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60_000 }), page.click(link)]);

    stage = "Input Controls";
    log("3. Input Controls…");
    await page.waitForSelector("#inputControls", { visible: true, timeout: 30_000 });
    await waitForLoading(page);

    // Organization: buka dropdown → ketik untuk menyaring → klik item yang cocok ("PT. Penguin Trading").
    // (ArrowDown+Enter memilih "*" karena daftar diawali "---" dan "*".)
    await scrollTo(page, "#AD_Org_ID");
    await page.waitForSelector("#AD_Org_ID a.jr-mSingleselect-input", { visible: true, timeout: 10_000 });
    await page.click("#AD_Org_ID a.jr-mSingleselect-input");
    await delay(800);
    await (await page.$("#AD_Org_ID input.jr-mInput-search"))?.focus();
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
    const org = await page.$eval("#AD_Org_ID .jr-mSingleselect-input-selection", (el) => el.textContent ?? "").catch(() => "");
    if (!org.includes(ORGANIZATION)) throw new Error(`Organization tidak terpilih (terbaca: "${org.trim()}").`);

    // Statement Date = hari ini (WIB).
    const today = todayJakarta();
    await scrollTo(page, "#statementdate");
    const dateInput = await page.$("#statementdate input");
    if (dateInput) {
      const current = await dateInput.evaluate((el) => (el as HTMLInputElement).value);
      if (!current.includes(today)) {
        await dateInput.click({ clickCount: 3 });
        await page.keyboard.press("Backspace");
        await dateInput.type(today);
        await page.keyboard.press("Tab");
        await delay(500);
      }
      const set = await dateInput.evaluate((el) => (el as HTMLInputElement).value);
      if (!set.includes(today)) throw new Error(`Statement Date tidak terisi (terbaca: "${set}").`);
    }
    await waitForLoading(page);

    // Tipe Transaksi = Piutang.
    await scrollTo(page, "#isSOtrx");
    const tipe = () => page.$eval("#isSOtrx .jr-mSingleselect-input-selection", (el) => el.textContent ?? "").catch(() => "");
    const piutang = (await tipe()).includes("Piutang");
    if (!piutang) {
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

    stage = "Generate laporan";
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
    await page.waitForFunction(() => {
      const idle = ["#loading", "#exportLoadingIndicator"].every((s) => {
        const el = document.querySelector<HTMLElement>(s);
        return !el || el.classList.contains("hidden") || el.style.display === "none";
      });
      const exp = document.querySelector<HTMLButtonElement>("#export");
      const ready = !!exp && !exp.disabled && !exp.hasAttribute("disabled");
      return idle && (document.querySelector("table.jrPage") !== null || ready);
    }, { timeout: 600_000 });
    log("   Laporan selesai digenerate.");

    stage = "Export › Excel";
    log("5. Export › Excel…");
    await page.waitForFunction(() => {
      const b = document.querySelector<HTMLButtonElement>("#export");
      return !!b && !b.disabled && !b.hasAttribute("disabled");
    }, { timeout: 30_000 });
    const before = new Set(fs.readdirSync(opt.downloadDir));
    // Seperti manual: arahkan kursor ke Export lalu klik; dialog Input Controls boleh tetap terbuka.
    const EXCEL = "::-p-xpath(//p[contains(@class,'wrap') and contains(@class,'button')][normalize-space()='Excel'])";
    let excel = null;
    for (let i = 0; i < 3 && !excel; i++) {
      await page.hover("#export");
      await page.click("#export");
      excel = await page.waitForSelector(EXCEL, { visible: true, timeout: 10_000 }).catch(() => null);
    }
    if (!excel) throw new Error("menu Export tidak menampilkan pilihan Excel");
    await excel.click(); // TEPAT satu klik (klik ganda = dua file)
    stage = "Unduh file";

    // Tunggu file Excel baru selesai diunduh (tanpa .crdownload).
    let file: string | null = null;
    for (let s = 0; s < 180 && !file; s++) {
      await delay(1000);
      const all = fs.readdirSync(opt.downloadDir);
      if (all.some((f) => f.endsWith(".crdownload"))) continue;
      file = all.filter((f) => isExcel(f) && !before.has(f)).at(-1) ?? null;
    }
    if (!file) throw new Error("File Excel tidak terunduh dalam 3 menit.");
    const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "short" }).format(new Date()).replace(":", "");
    const finalPath = path.join(opt.downloadDir, `Aging Detail ${stamp}${path.extname(file)}`);
    fs.renameSync(path.join(opt.downloadDir, file), finalPath);
    log(`   Terunduh: ${path.basename(finalPath)} (${(fs.statSync(finalPath).size / 1024).toFixed(0)} KB)`);
    return finalPath;
  } catch (e) {
    fs.mkdirSync(opt.logDir, { recursive: true });
    const base = path.join(opt.logDir, `error-${Date.now()}`);
    await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
    const html = await page.content().catch(() => "");
    if (html) fs.writeFileSync(`${base}.html`, html);
    log(`   Bahan diagnosis: ${base}.png / .html`);
    throw new Error(`${stage}: ${(e as Error).message}`);
  } finally {
    await browser.close();
  }
}

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

// Tunggu indikator loading / dimmer Jaspersoft hilang.
async function waitForLoading(page: Page, timeoutMs = 60_000) {
  await delay(500);
  await page.waitForFunction(() => {
    const hidden = (sel: string) => {
      const el = document.querySelector<HTMLElement>(sel);
      return !el || el.classList.contains("hidden") || el.style.display === "none";
    };
    return hidden("#loading") && hidden(".dimmer") && hidden("#exportLoadingIndicator");
  }, { timeout: timeoutMs }).catch(() => log("  (indikator loading timeout, lanjut)"));
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

    log("2. Library › Aging Detail…");
    await page.waitForSelector("#main_library", { visible: true, timeout: 20_000 });
    await page.click("#main_library");
    const link = "a::-p-text(Aging Detail)";
    await page.waitForSelector(link, { visible: true, timeout: 20_000 });
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60_000 }), page.click(link)]);

    log("3. Input Controls…");
    await page.waitForSelector("#inputControls", { visible: true, timeout: 30_000 });
    await waitForLoading(page);

    // Organization: klik dropdown → ketik → ArrowDown → Enter (cara yang terbukti di bot lama).
    await scrollTo(page, "#AD_Org_ID");
    await page.waitForSelector("#AD_Org_ID a.jr-mSingleselect-input", { visible: true, timeout: 10_000 });
    await page.click("#AD_Org_ID a.jr-mSingleselect-input");
    await delay(800);
    await (await page.$("#AD_Org_ID input.jr-mInput-search"))?.focus();
    await page.keyboard.type(ORGANIZATION, { delay: 100 });
    await delay(1000);
    await page.keyboard.press("ArrowDown");
    await delay(500);
    await page.keyboard.press("Enter");
    await delay(1000);
    await page.evaluate((org) => {
      const item = [...document.querySelectorAll<HTMLElement>("li.jr-mSelectlist-item")]
        .find((el) => (el.getAttribute("title") ?? el.textContent ?? "").includes(org));
      if (item && item.offsetParent !== null) (item.querySelector("a") ?? item).click();
    }, ORGANIZATION);
    await waitForLoading(page);
    const org = await page.$eval("#AD_Org_ID a.jr-mSingleselect-input", (el) => (el as HTMLElement).title || el.textContent || "").catch(() => "");
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
        await delay(500);
      }
    }
    await waitForLoading(page);

    // Tipe Transaksi = Piutang.
    await scrollTo(page, "#isSOtrx");
    const piutang = await page.evaluate(() => {
      const t = document.querySelector<HTMLElement>("#isSOtrx a.jr-mSingleselect-input");
      return !!t && (t.title || t.textContent || "").includes("Piutang");
    });
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
    }
    log(`   Organization ${ORGANIZATION} · Statement Date ${today} · Piutang`);

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
      const hidden = (sel: string) => {
        const el = document.querySelector<HTMLElement>(sel);
        return !el || el.classList.contains("hidden") || el.style.display === "none";
      };
      const exp = document.querySelector<HTMLButtonElement>("#export");
      const ready = !!exp && !exp.disabled && !exp.hasAttribute("disabled");
      return hidden("#loading") && hidden("#exportLoadingIndicator") && (document.querySelector("table.jrPage") !== null || ready);
    }, { timeout: 300_000 });

    log("5. Export › Excel…");
    await page.waitForFunction(() => {
      const b = document.querySelector<HTMLButtonElement>("#export");
      return !!b && !b.disabled && !b.hasAttribute("disabled");
    }, { timeout: 30_000 });
    await scrollTo(page, "#export");
    const before = new Set(fs.readdirSync(opt.downloadDir));
    const menuOpen = await page.evaluate(() => {
      const m = document.querySelector<HTMLElement>("#menu");
      return !!m && !m.classList.contains("hidden") && m.style.display !== "none";
    });
    if (!menuOpen) { await page.click("#export"); await delay(800); }
    await page.waitForFunction(() =>
      !!(document.querySelector("#menuList_simpleAction_41 p.wrap.button") ||
        [...document.querySelectorAll("#menuList p.wrap.button, #menu p.wrap.button")].find((p) => p.textContent?.replace(/\s+/g, " ").trim() === "Excel")),
    { timeout: 15_000 });
    const clicked = await page.evaluate(() => {
      const target = document.querySelector<HTMLElement>("#menuList_simpleAction_41 p.wrap.button") ??
        [...document.querySelectorAll<HTMLElement>("#menuList p.wrap.button, #menu p.wrap.button")].find((p) => p.textContent?.replace(/\s+/g, " ").trim() === "Excel");
      target?.click(); // TEPAT satu klik (klik ganda = dua file)
      return !!target;
    });
    if (!clicked) throw new Error("Tombol Export › Excel tidak ditemukan.");

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
    const shot = path.join(opt.logDir, `error-${Date.now()}.png`);
    await page.screenshot({ path: shot as `${string}.png`, fullPage: true }).catch(() => {});
    log(`   Screenshot galat: ${shot}`);
    throw e;
  } finally {
    await browser.close();
  }
}

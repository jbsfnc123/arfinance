// Sesi EDI Mitra 10 (edi.mitra10.com). Langkah & selector dari bot.js / bot_download_kwitansi.js milik user.
import fs from "node:fs";
import path from "node:path";
import type { Page } from "puppeteer-core";
import type { EdiAccount } from "~/shared/types";
import { delay, type RunContext } from "~/runner/ctx";
import { waitDownload } from "~/runner/download";

const LOGIN_URL = "https://edi.mitra10.com/site/login";

/** Akun EDI yang dipakai job: `ids` terpilih, atau semua akun aktif. */
export function pickAccounts(ctx: RunContext, ids?: string[]): (EdiAccount & { password: string })[] {
  const all = ctx.config.edi.accounts;
  const list = ids?.length ? all.filter((a) => ids.includes(a.id)) : all.filter((a) => a.active);
  if (!list.length) throw new Error("Tidak ada akun EDI aktif (atur di EDI Mitra 10 › Akun).");
  return list.map((a) => {
    const password = ctx.secrets[`edi:${a.id}`];
    if (!password) throw new Error(`Password akun EDI ${a.label || a.username} belum diisi.`);
    return { ...a, password };
  });
}

/** Halaman baru: dialog alert diterima otomatis, jendela popup tambahan ditutup, unduhan diarahkan ke `dir`. */
export async function ediPage(ctx: RunContext, dir?: string) {
  const page = await ctx.newPage();
  page.on("dialog", (d) => { ctx.info(`Pesan EDI: "${d.message()}"`); d.accept().catch(() => {}); });
  // Tutup hanya jendela popup yang dibuka oleh halaman ini (bukan halaman baru milik job lain di browser yang sama).
  page.browser().on("targetcreated", async (t) => {
    if (t.type() !== "page" || t.opener() !== page.target()) return;
    const p = await t.page().catch(() => null);
    if (p) setTimeout(() => { if (!p.isClosed()) p.close().catch(() => {}); }, 2500);
  });
  if (dir) {
    const cdp = await page.createCDPSession();
    await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dir });
  }
  return page;
}

export async function ediLogin(ctx: RunContext, page: Page, acc: { username: string; password: string }) {
  ctx.check();
  await page.goto(LOGIN_URL, { waitUntil: "networkidle2", timeout: 60_000 });
  await page.waitForSelector("#loginform-username", { timeout: 20_000 });
  await page.$eval("#loginform-username", (el) => { (el as HTMLInputElement).value = ""; });
  await page.$eval("#loginform-password", (el) => { (el as HTMLInputElement).value = ""; });
  await page.type("#loginform-username", acc.username, { delay: 40 });
  await page.type("#loginform-password", acc.password, { delay: 40 });
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60_000 }), page.click("button[type='submit']")]);
  if (await page.$("#loginform-username")) throw new Error("login EDI gagal (periksa username/password)");
}

/** Halaman "Select partner": pilih baris kedua (baris pertama = placeholder). */
export async function selectPartner(ctx: RunContext, page: Page) {
  await page.waitForSelector("select", { timeout: 20_000 });
  const sel = (await page.$("#partnerlist")) ? "#partnerlist" : "select";
  const value = await page.$eval(sel, (el) => { const s = el as HTMLSelectElement; return s.options.length > 1 ? s.options[1].value : null; });
  if (!value) { ctx.warn("Partner baris kedua tidak ditemukan — lanjut."); return; }
  await page.select(sel, value);
  await page.$eval(sel, (el) => el.dispatchEvent(new Event("change", { bubbles: true })));
  await page.waitForSelector("#preloader", { hidden: true, timeout: 15_000 }).catch(() => {});
  await delay(1200);
}

/** Menu Report › submenu bertautan `hrefPart`. */
export async function openEdiReport(page: Page, hrefPart: string) {
  await page.waitForSelector(".reportTree > a", { visible: true, timeout: 15_000 });
  await page.$eval(".reportTree > a", (el) => { el.scrollIntoView(); (el as HTMLElement).click(); });
  await delay(1000);
  const link = `a[href*='${hrefPart}']`;
  await page.waitForSelector(link, { timeout: 15_000 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30_000 }).catch(() => {}),
    page.$eval(link, (el) => (el as HTMLElement).click()),
  ]);
  await page.waitForSelector("#preloader", { hidden: true, timeout: 15_000 }).catch(() => {});
  await delay(1500);
}

export async function ediLogout(page: Page) {
  try {
    await page.waitForSelector("#navbarDropdownMenuLink", { visible: true, timeout: 15_000 });
    await page.$eval("#navbarDropdownMenuLink", (el) => (el as HTMLElement).click());
    await delay(1000);
    await page.waitForSelector("a.logOut", { timeout: 10_000 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30_000 }).catch(() => {}),
      page.$eval("a.logOut", (el) => (el as HTMLElement).click()),
    ]);
  } catch { /* logout gagal tidak membatalkan hasil */ }
}

/** Tunggu file baru (bukan .crdownload) yang cocok `re` muncul di `dir`. */
export const waitNewFile = (ctx: RunContext, dir: string, before: Set<string>, re: RegExp, seconds = 90) =>
  waitDownload(ctx, dir, before, re, seconds);

/** Uji login satu akun (Pengaturan / halaman Akun). */
export async function testEdiLogin(ctx: RunContext, accountId: string) {
  const [acc] = pickAccounts(ctx, [accountId]);
  const page = await ediPage(ctx);
  await ediLogin(ctx, page, acc);
  await ediLogout(page);
  return `login ${acc.username} berhasil`;
}

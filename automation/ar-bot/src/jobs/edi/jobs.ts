// Job EDI Mitra 10: GR Report Detail & Download Kwitansi untuk banyak akun. Akun yang gagal tidak menghentikan akun lain;
// job dinyatakan gagal bila ada akun yang gagal (file akun yang berhasil tetap tersimpan).
import fs from "node:fs";
import path from "node:path";
import type { Page } from "puppeteer-core";
import type { JobParams } from "~/shared/types";
import { jobDir } from "~/core/paths";
import { delay, type RunContext } from "~/runner/ctx";
import type { JobOut } from "../jasper/jobs";
import { ediLogin, ediLogout, ediPage, openEdiReport, pickAccounts, selectPartner, waitNewFile } from "./session";
import { ediUploadFakturJob } from "./faktur";
import { archive, inspectM10Gr, inspectM10Kw, markPushed, num, pushM10Gr, pushM10Kw, sha256, unchanged } from "../arw";
import { todayJakarta } from "@/lib/parsers/date";

export { ediUploadFakturJob };

const stamp = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "medium" }).format(new Date()).replace(/:/g, "");
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").trim();

type Acc = ReturnType<typeof pickAccounts>[number];

/**
 * Kirim file satu akun ke AR Workspace (Mitra10). Lewati bila uji coba / kirim nonaktif / file identik dengan kiriman
 * sukses terakhir akun ini; arsip Drive lalu kirim. Mengembalikan ringkasan hasil kirim, atau null bila tidak dikirim.
 */
async function pushFile(ctx: RunContext, p: JobParams, key: string, file: string, send: () => Promise<string>) {
  if (ctx.opts.dryRun) { ctx.info("Uji coba: tidak diarsip & tidak dikirim."); return null; }
  if (!p.push) { ctx.info("Kirim ke AR Workspace nonaktif untuk job ini."); return null; }
  const sha = sha256(fs.readFileSync(file));
  if (unchanged(ctx, key, sha)) return null;
  await archive(ctx, file, todayJakarta().slice(0, 7));
  const msg = await send();
  markPushed(key, sha);
  ctx.log("ok", `AR Workspace: ${msg}`);
  return msg;
}

/** Jalankan `fn` per akun dengan login/partner/logout; kumpulkan file & akun yang gagal. */
async function perAccount(ctx: RunContext, accounts: Acc[], dir: string, fn: (page: Page, acc: Acc) => Promise<string>) {
  const files: string[] = [], failed: string[] = [];
  for (const [i, acc] of accounts.entries()) {
    ctx.check();
    const name = acc.label || acc.username;
    ctx.info(`Akun ${i + 1}/${accounts.length}: ${name}`);
    let page: Page | null = null;
    try {
      page = await ediPage(ctx, dir);
      await ediLogin(ctx, page, acc);
      await selectPartner(ctx, page);
      files.push(await fn(page, acc));
      await ediLogout(page);
    } catch (e) {
      ctx.check();
      failed.push(`${name}: ${(e as Error).message.split("\n")[0]}`);
      ctx.log("error", `Akun ${name} gagal: ${(e as Error).message.split("\n")[0]}`);
      await ctx.diagnose(page, `edi-${acc.id}`);
    } finally {
      await page?.close().catch(() => {});
    }
  }
  const summary = `${files.length}/${accounts.length} akun`;
  if (failed.length) throw new Error(`${failed.length} akun gagal (${summary} berhasil) — ${failed.join(" · ")}`);
  return { files, summary };
}

export async function ediGrJob(ctx: RunContext, p: JobParams): Promise<JobOut> {
  const accounts = pickAccounts(ctx, p.accounts);
  const dir = jobDir("edi.gr");
  const today = new Date();
  const start = p.start || iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30)), end = p.end || iso(today);
  ctx.info(`Periode ${start} s/d ${end} · ${accounts.length} akun`);
  let newRows = 0, pushed = false;
  const r = await perAccount(ctx, accounts, dir, async (page, acc) => {
    await openEdiReport(page, "gr-report-detail");
    await page.waitForSelector("#startDate", { timeout: 20_000 });
    await page.evaluate((s: string, e: string) => {
      for (const [id, v] of [["#startDate", s], ["#endDate", e]]) {
        const el = document.querySelector<HTMLInputElement>(id);
        if (!el) continue;
        el.value = v;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, start, end);
    await page.waitForSelector("#preloader", { hidden: true, timeout: 5000 }).catch(() => {});
    await delay(1500);
    const before = new Set(fs.readdirSync(dir));
    const clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => (x.getAttribute("onclick") ?? "").includes("downloadCsv"));
      if (b) { b.click(); return true; }
      return false;
    });
    if (!clicked) throw new Error("tombol Download CSV tidak ditemukan");
    const file = await waitNewFile(ctx, dir, before, /\.csv$/i, 90);
    if (!file) throw new Error("file CSV tidak terunduh dalam 90 detik");
    const final = path.join(dir, `GR Report ${safe(acc.label || acc.username)} ${stamp()}.csv`);
    fs.renameSync(file, final);
    ctx.info(`Terunduh: ${path.basename(final)}`);
    const parsed = inspectM10Gr(fs.readFileSync(final, "utf8"));
    ctx.info(`Baca: ${num(parsed.lines)} baris CSV · ${num(parsed.rows.length)} baris GR · ${num(parsed.sjCount)} SJ NO`);
    const sent = await pushFile(ctx, p, `edi.gr:${acc.id}`, final, async () => {
      const added = await pushM10Gr(ctx, final, parsed);
      newRows += added;
      pushed = true;
      return `GR ${acc.label || acc.username}: ${num(added)} data baru (sisanya sudah ada).`;
    });
    if (sent === null && !ctx.opts.dryRun && p.push) pushed = true;
    return final;
  });
  return { files: r.files, summary: pushed ? `${r.summary} · ${num(newRows)} GR baru` : r.summary, pushed };
}

export async function ediKwitansiJob(ctx: RunContext, p: JobParams): Promise<JobOut> {
  const accounts = pickAccounts(ctx, p.accounts);
  const dir = jobDir("edi.kwitansi");
  const now = new Date();
  const month = p.start?.slice(0, 7) || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  ctx.info(`Bulan ${month} · ${accounts.length} akun`);
  let newRows = 0, pushed = false;
  const r = await perAccount(ctx, accounts, dir, async (page, acc) => {
    await openEdiReport(page, "invoice-summary");
    await page.waitForSelector("#bulan", { visible: true, timeout: 20_000 });
    await page.evaluate((m: string) => {
      const input = document.querySelector<HTMLInputElement>("#bulan");
      if (!input) return;
      input.focus();
      input.value = m;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      const $ = (window as unknown as { $?: (s: string) => { val: (v: string) => { trigger: (e: string) => void } } }).$;
      if (typeof $ === "function") $("#bulan").val(m).trigger("change");
    }, month);
    const got = await page.$eval("#bulan", (el) => (el as HTMLInputElement).value);
    if (got !== month) throw new Error(`bulan tidak terisi (terbaca "${got}")`);
    await delay(800);

    const before = new Set(fs.readdirSync(dir));
    const requestedAt = Date.now();
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) =>
        (x.getAttribute("onclick") ?? "").includes("downloadCsv2") || (x.textContent?.trim() === "CSV" && x.classList.contains("btn-success")));
      const w = window as unknown as { downloadCsv2?: () => void };
      if (b) b.click(); else if (typeof w.downloadCsv2 === "function") w.downloadCsv2();
    });
    await delay(3000);
    await page.waitForSelector("#custom-tabs-one-invoices-tab", { visible: true, timeout: 15_000 });
    await page.click("#custom-tabs-one-invoices-tab");
    await delay(2000);

    // Laporan dibuat di server EDI; pantau "Download List" sampai file Invoice_Summary-<waktu request ±60 dtk> muncul.
    let clicked: string | null = null;
    for (let attempt = 1; attempt <= 18 && !clicked; attempt++) {
      ctx.check();
      clicked = await page.evaluate((req: number) => {
        const btns = [...document.querySelectorAll<HTMLElement>("#dlTable button, #dlTable a, #custom-tabs-one-invoices button, #custom-tabs-one-invoices a")];
        let best: { el: HTMLElement; diff: number; text: string } | null = null;
        for (const b of btns) {
          const text = b.textContent?.trim() ?? "";
          const m = text.match(/Invoice_Summary-(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/i);
          if (!m) continue;
          const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
          const diff = Math.abs(t - req) / 1000;
          if (!best || diff < best.diff) best = { el: b, diff, text };
        }
        if (best && best.diff <= 60) { best.el.click(); return best.text; }
        return null;
      }, requestedAt);
      if (clicked) break;
      ctx.info(`Menunggu file kwitansi dibuat server EDI (percobaan ${attempt}/18)…`);
      await page.evaluate(() => {
        const r = document.querySelector<HTMLElement>("button.refreshBtn") ?? document.querySelector<HTMLElement>("button[onclick*='refreshList']");
        const w = window as unknown as { refreshList?: () => void };
        if (r) r.click(); else if (typeof w.refreshList === "function") w.refreshList();
      });
      await delay(10_000);
    }
    if (!clicked) throw new Error("file kwitansi belum muncul di Download List setelah 3 menit");
    const file = await waitNewFile(ctx, dir, before, /invoice_summary.*\.csv$/i, 60);
    if (!file) throw new Error(`file ${clicked} tidak terunduh`);
    const final = path.join(dir, `Kwitansi ${safe(acc.label || acc.username)} ${month} ${stamp()}.csv`);
    fs.renameSync(file, final);
    ctx.info(`Terunduh: ${path.basename(final)}`);
    const parsed = inspectM10Kw(fs.readFileSync(final, "utf8"));
    ctx.info(`Baca: ${num(parsed.rows.length)} kwitansi · ${parsed.dupInFile} ganda dalam file`);
    const sent = await pushFile(ctx, p, `edi.kwitansi:${acc.id}`, final, async () => {
      const k = await pushM10Kw(ctx, final, parsed, acc.username);
      newRows += k.added;
      pushed = true;
      return `Kwitansi (${acc.label || acc.username}): ${num(k.added)} baru, ${num(k.skipped)} sudah ada.`;
    });
    if (sent === null && !ctx.opts.dryRun && p.push) pushed = true;
    return final;
  });
  return { files: r.files, summary: pushed ? `${r.summary} · ${num(newRows)} kwitansi baru` : r.summary, pushed };
}

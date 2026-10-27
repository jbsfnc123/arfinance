// Invoice Inbox EDI Mitra 10: Create Invoice dari PFI berstatus Completed di menu Inbox (einvoice-inbox).
// Langkah awal sama dengan Upload Faktur (partner → Invoices → vendor), lalu ke Inbox. Filter Status = Completed, kemudian
// berulang: centang SATU baris teratas yang Completed → Create Invoice → konfirmasi (dialog diterima otomatis oleh ediPage)
// → baca pesan SweetAlert → tabel dimuat ulang. Baris yang sudah dicoba tidak dipilih lagi. Uji coba: hanya mendaftar baris.
// Aksi tulis di situs luar: tanpa retry otomatis (runner) & tidak boleh masuk rangkaian terjadwal.
import type { Page } from "puppeteer-core";
import type { JobParams } from "~/shared/types";
import { delay, type RunContext } from "~/runner/ctx";
import type { JobOut } from "../jasper/jobs";
import { ediLogin, ediLogout, ediPage, openInvoices, pickAccounts } from "./session";
import { inboxLimit, isSuccess, nextCompleted, rowLabel, type InboxRow } from "./inbox-pick";

/** Tunggu DataTable Inbox selesai memuat. */
async function settle(page: Page) {
  await delay(1200);
  await page.waitForSelector("#pfiTable_processing", { hidden: true, timeout: 30_000 }).catch(() => {});
  await page.waitForSelector("#preloader", { hidden: true, timeout: 15_000 }).catch(() => {});
  await delay(600);
}

/** Tampilkan hingga 100 baris per halaman (DataTable server-side, bawaan 10). */
async function showMany(page: Page) {
  const changed = await page.evaluate(() => {
    type Dt = { page: { len: (n?: number) => number & { draw: (p?: boolean) => void } } };
    const jq = (window as unknown as { jQuery?: (s: string) => { DataTable?: () => Dt } }).jQuery;
    try {
      const dt = jq?.("#pfiTable").DataTable?.();
      if (!dt || dt.page.len() >= 100) return false;
      (dt.page.len(100) as unknown as { draw: (p?: boolean) => void }).draw(false);
      return true;
    } catch { return false; }
  });
  if (changed) await settle(page);
}

/** Filter Status = Completed (opsi dipilih berdasarkan teks; daftar status dimuat server). Klik Search. */
async function searchCompleted(ctx: RunContext, page: Page) {
  await page.waitForFunction(() => (document.querySelector<HTMLSelectElement>("#statusPfi")?.options.length ?? 0) > 1, { timeout: 15_000 }).catch(() => {});
  const filtered = await page.evaluate(() => {
    const s = document.querySelector<HTMLSelectElement>("#statusPfi");
    const o = s ? [...s.options].find((x) => (x.textContent ?? "").trim().toLowerCase() === "completed") : undefined;
    if (!s || !o) return false;
    s.value = o.value;
    s.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  });
  ctx.info(filtered ? "Filter Status: Completed." : "Filter Status Completed tidak tersedia — semua status ditampilkan, baris dicek satu per satu.");
  await page.evaluate(() => {
    const b = document.querySelector<HTMLElement>("button[onclick*='fetchDataPfi']");
    const w = window as unknown as { fetchDataPfi?: () => void };
    if (b) b.click(); else if (typeof w.fetchDataPfi === "function") w.fetchDataPfi();
  });
  await settle(page);
  await showMany(page);
}

async function readRows(page: Page): Promise<InboxRow[]> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLTableRowElement>("#pfiTable tbody tr")].flatMap((tr) => {
    const chk = tr.querySelector<HTMLInputElement>("input.chk_pfi_id");
    if (!chk) return [];
    const td = [...tr.querySelectorAll<HTMLElement>("td")].map((x) => x.innerText.trim());
    return [{ id: chk.value, docNo: td[2] ?? "", status: td[6] ?? "", poNo: td[8] ?? "", sj: td[12] ?? "" }];
  }));
}

/** Centang hanya baris `id`, klik Create Invoice, tunggu & baca SweetAlert hasilnya, lalu tutup. */
async function createOne(page: Page, id: string) {
  const checked = await page.evaluate((v: string) => {
    let hit = false;
    for (const el of document.querySelectorAll<HTMLInputElement>("input.chk_pfi_id")) {
      const on = el.value === v;
      if (el.checked !== on) el.click();
      if (on && el.checked) hit = true;
    }
    return hit;
  }, id);
  if (!checked) throw new Error("baris tidak bisa dicentang");
  await delay(300);
  await page.evaluate(() => {
    const b = document.querySelector<HTMLElement>("button[onclick*='createBulkInv']");
    const w = window as unknown as { createBulkInv?: () => void };
    if (b) b.click(); else if (typeof w.createBulkInv === "function") w.createBulkInv();
  });
  // Dialog konfirmasi bawaan browser (confirm) diterima otomatis oleh handler `dialog` di ediPage (setara menekan Enter).
  let msg: string | null = null;
  for (const until = Date.now() + 60_000; Date.now() < until && msg === null;) {
    msg = await page.evaluate(() => {
      const pop = document.querySelector<HTMLElement>(".swal2-popup");
      if (!pop || pop.offsetParent === null) return null;
      return `${document.querySelector<HTMLElement>(".swal2-title")?.innerText ?? ""} ${document.querySelector<HTMLElement>(".swal2-html-container, .swal2-content")?.innerText ?? ""}`.trim();
    });
    if (msg === null) await delay(700);
  }
  await page.evaluate(() => document.querySelector<HTMLElement>(".swal2-confirm")?.click());
  await settle(page);
  await showMany(page);
  return msg ?? "";
}

export async function ediInvoiceInboxJob(ctx: RunContext, p: JobParams): Promise<JobOut> {
  const accounts = pickAccounts(ctx, p.accounts);
  const limit = inboxLimit(p.limit);
  ctx.info(`${accounts.length} akun · maks. ${limit} invoice per akun${ctx.opts.dryRun ? " · UJI COBA (tanpa Create Invoice)" : ""}`);
  let made = 0, listed = 0;
  const failed: string[] = [];
  for (const [i, acc] of accounts.entries()) {
    ctx.check();
    const name = acc.label || acc.username;
    ctx.info(`Akun ${i + 1}/${accounts.length}: ${name}`);
    let page: Page | null = null;
    try {
      page = await ediPage(ctx);
      await ediLogin(ctx, page, acc);
      await openInvoices(ctx, page, "einvoice-inbox");
      await page.waitForSelector("#pfiTable", { timeout: 20_000 });
      await searchCompleted(ctx, page);
      const tried = new Set<string>(), logged = new Set<string>();
      let count = 0;
      while (count < limit) {
        ctx.check();
        const { row, skipped } = nextCompleted(await readRows(page), tried);
        for (const s of skipped) if (!logged.has(s.id)) { logged.add(s.id); ctx.info(`  Dilewati (status ${s.status || "-"}): ${rowLabel(s)}`); }
        if (!row) break;
        tried.add(row.id);
        count++;
        if (ctx.opts.dryRun) { listed++; ctx.info(`  [${count}] Akan dibuat invoice: ${rowLabel(row)}`); continue; }
        ctx.info(`  [${count}] Create Invoice: ${rowLabel(row)}…`);
        const msg = await createOne(page, row.id);
        if (isSuccess(msg)) { made++; ctx.log("ok", `  ${row.docNo}: ${msg.replace(/\s+/g, " ")}`); }
        else { failed.push(`${row.docNo}: ${msg || "tanpa pesan"}`); ctx.warn(`  ${row.docNo} gagal: ${msg || "tidak ada pesan dari EDI"}`); }
      }
      if (count >= limit) ctx.warn(`Batas ${limit} invoice per run tercapai untuk akun ${name}.`);
      if (!count) ctx.info("Tidak ada baris berstatus Completed di Inbox.");
      await ediLogout(page);
    } catch (e) {
      ctx.check();
      failed.push(`${name}: ${(e as Error).message.split("\n")[0]}`);
      ctx.log("error", `Akun ${name} gagal: ${(e as Error).message.split("\n")[0]}`);
      await ctx.diagnose(page, `inbox-${acc.id}`);
    } finally {
      await page?.close().catch(() => {});
    }
  }
  const summary = ctx.opts.dryRun ? `${listed} baris Completed siap dibuat invoice` : `${made} invoice dibuat${failed.length ? ` · ${failed.length} gagal` : ""}`;
  if (failed.length) throw new Error(`${summary} — ${failed.slice(0, 5).join(" · ")}${failed.length > 5 ? " …" : ""}`);
  return { status: made || listed ? "ok" : "skipped", summary, rows: made || listed };
}

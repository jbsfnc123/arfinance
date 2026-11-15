// Outbox Invoice EDI Mitra 10 (menu Outbox › tab Invoice, einvoice-outbox): Create Kuitansi massal.
// Langkah awal sama dengan Invoice Inbox (partner → Invoices → vendor), lalu berulang per batch:
//   tampilkan 100 entries → centang SEMUA invoice di halaman → Create Kuitansi → konfirmasi (dialog bawaan browser diterima
//   otomatis oleh ediPage = Enter/OK) → baca SweetAlert & klik OK → tabel dimuat ulang (EDI) → ulangi sampai list habis.
// Pengaman: maks. MAX_BATCH batch; berhenti bila baris yang sama tetap ada sesudah Create Kuitansi (EDI menolak).
// Uji coba: hanya mencatat jumlah & isi list. Aksi tulis di situs luar: tanpa retry otomatis & tidak boleh terjadwal.
import type { Page } from "puppeteer-core";
import type { JobParams } from "~/shared/types";
import { delay, type RunContext } from "~/runner/ctx";
import type { JobOut } from "../jasper/jobs";
import { ediLogin, ediLogout, ediPage, openInvoices, pickAccounts } from "./session";
import { batchLabel, isKuitansiSuccess, MAX_BATCH, nextBatchDecision, type OutboxRow } from "./outbox-pick";

/** Tunggu DataTable Invoice Outbox selesai memuat. */
async function settle(page: Page) {
  await delay(1200);
  await page.waitForSelector("#tableInvoice_processing", { hidden: true, timeout: 30_000 }).catch(() => {});
  await page.waitForSelector("#preloader", { hidden: true, timeout: 15_000 }).catch(() => {});
  await delay(600);
}

/** Tampilkan 100 entries (DataTable server-side; cadangan: pilih opsi 100 di dropdown "Show entries"). */
async function show100(page: Page) {
  const ok = await page.evaluate(() => {
    type Dt = { page: { len: (n?: number) => number & { draw: (p?: boolean) => void } } };
    const jq = (window as unknown as { jQuery?: (s: string) => { DataTable?: () => Dt } }).jQuery;
    try {
      const dt = jq?.("#tableInvoice").DataTable?.();
      if (!dt) return false;
      if (dt.page.len() !== 100) (dt.page.len(100) as unknown as { draw: (p?: boolean) => void }).draw(false);
      return true;
    } catch { return false; }
  });
  if (!ok) {
    await page.select("select[name='tableInvoice_length']", "100").catch(() => {});
  }
  await settle(page);
}

/** Buka tab Invoice & muat list (tombol Search / fetchDataOutboxInv). */
async function loadList(page: Page) {
  await page.evaluate(() => document.querySelector<HTMLElement>("#custom-tabs-one-invoices-tab")?.click());
  await delay(800);
  await page.evaluate(() => {
    const b = document.querySelector<HTMLElement>("button[onclick*='fetchDataOutboxInv']");
    const w = window as unknown as { fetchDataOutboxInv?: () => void };
    if (b) b.click(); else if (typeof w.fetchDataOutboxInv === "function") w.fetchDataOutboxInv();
  });
  await settle(page);
}

async function readRows(page: Page): Promise<{ rows: OutboxRow[]; total: number }> {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLTableRowElement>("#tableInvoice tbody tr")].flatMap((tr) => {
      const chk = tr.querySelector<HTMLInputElement>("input.invId");
      if (!chk) return [];
      const td = [...tr.querySelectorAll<HTMLElement>("td")].map((x) => x.innerText.trim());
      return [{ id: chk.value, docNo: td[2] ?? "", pfiNo: td[3] ?? "", invoiceDate: td[5] ?? "", vendorInvoiceNo: td[7] ?? "", totalNet: td[12] ?? "" }];
    });
    type Dt = { page: { info: () => { recordsDisplay: number } } };
    const jq = (window as unknown as { jQuery?: (s: string) => { DataTable?: () => Dt } }).jQuery;
    let total = rows.length;
    try { total = jq?.("#tableInvoice").DataTable?.().page.info().recordsDisplay ?? rows.length; } catch { /* tanpa DataTable */ }
    return { rows, total };
  });
}

/** Tunggu SweetAlert tampil (maks. `ms`), kembalikan teksnya; null bila tidak muncul. */
async function waitSwal(page: Page, ms = 90_000) {
  for (const until = Date.now() + ms; Date.now() < until;) {
    const msg = await page.evaluate(() => {
      const pop = document.querySelector<HTMLElement>(".swal2-popup");
      if (!pop || pop.offsetParent === null) return null;
      return `${document.querySelector<HTMLElement>(".swal2-title")?.innerText ?? ""} ${document.querySelector<HTMLElement>(".swal2-html-container, .swal2-content")?.innerText ?? ""}`.trim();
    });
    if (msg !== null) return msg;
    await delay(700);
  }
  return null;
}

/** Centang semua invoice di halaman → Create Kuitansi → OK. Mengembalikan pesan EDI. */
async function createKuitansi(page: Page) {
  const checked = await page.evaluate(() => {
    let n = 0;
    for (const el of document.querySelectorAll<HTMLInputElement>("#tableInvoice input.invId")) {
      if (!el.checked) el.click();
      if (el.checked) n++;
    }
    return n;
  });
  if (!checked) throw new Error("tidak ada invoice yang bisa dicentang");
  await delay(400);
  await page.evaluate(() => {
    const b = document.querySelector<HTMLElement>("button.btnCreateKui") ?? document.querySelector<HTMLElement>("button[onclick*='createKuitansi']");
    const w = window as unknown as { createKuitansi?: () => void };
    if (b) b.click(); else if (typeof w.createKuitansi === "function") w.createKuitansi();
  });
  // Konfirmasi "Apakah anda yakin akan melakukan create kuitansi?" (confirm bawaan) diterima otomatis oleh ediPage.
  const msg = await waitSwal(page);
  await page.evaluate(() => document.querySelector<HTMLElement>(".swal2-confirm")?.click());
  await settle(page);
  return { checked, msg: (msg ?? "").replace(/\s+/g, " ").trim() };
}

export async function ediOutboxInvoiceJob(ctx: RunContext, p: JobParams): Promise<JobOut> {
  const accounts = pickAccounts(ctx, p.accounts);
  ctx.info(`${accounts.length} akun · Outbox › Invoice · Create Kuitansi 100 per batch${ctx.opts.dryRun ? " · UJI COBA (tanpa Create Kuitansi)" : ""}`);
  let made = 0, listed = 0, batches = 0;
  const failed: string[] = [];
  for (const [i, acc] of accounts.entries()) {
    ctx.check();
    const name = acc.label || acc.username;
    ctx.info(`Akun ${i + 1}/${accounts.length}: ${name}`);
    let page: Page | null = null;
    try {
      page = await ediPage(ctx);
      await ediLogin(ctx, page, acc);
      await openInvoices(ctx, page, "einvoice-outbox");
      await page.waitForSelector("#tableInvoice", { timeout: 20_000 });
      await loadList(page);
      let prev: string[] | null = null;
      for (let batch = 0; ; batch++) {
        ctx.check();
        await show100(page);
        const { rows, total } = await readRows(page);
        const decision = nextBatchDecision(prev, rows.map((r) => r.id), batch);
        if (decision === "done") { ctx.info(batch ? "List Outbox Invoice sudah habis." : "Tidak ada invoice di Outbox › Invoice."); break; }
        if (decision === "stuck") {
          failed.push(`${name}: invoice batch sebelumnya masih ada sesudah Create Kuitansi`);
          ctx.warn(`Berhenti: ${rows.length} invoice yang sama masih ada sesudah Create Kuitansi (cek pesan EDI di atas).`);
          break;
        }
        if (decision === "limit") { ctx.warn(`Batas ${MAX_BATCH} batch tercapai — sisa ${total} invoice, jalankan lagi.`); break; }
        if (ctx.opts.dryRun) {
          listed += total;
          ctx.info(`  ${total} invoice di Outbox siap dibuat kuitansi (${Math.ceil(total / 100)} batch). Halaman pertama: ${batchLabel(rows, 5)}`);
          break;
        }
        ctx.info(`  Batch ${batch + 1}: centang ${rows.length} dari ${total} invoice — ${batchLabel(rows)}`);
        const r = await createKuitansi(page);
        if (!isKuitansiSuccess(r.msg)) {
          failed.push(`${name} batch ${batch + 1}: ${r.msg || "tidak ada pesan dari EDI"}`);
          ctx.warn(`  Batch ${batch + 1} gagal: ${r.msg || "tidak ada pesan dari EDI"}`);
          break;
        }
        made += r.checked;
        batches++;
        ctx.log("ok", `  Batch ${batch + 1}: ${r.checked} invoice — ${r.msg}`);
        prev = rows.map((x) => x.id);
        await loadList(page);
      }
      await ediLogout(page);
    } catch (e) {
      ctx.check();
      failed.push(`${name}: ${(e as Error).message.split("\n")[0]}`);
      ctx.log("error", `Akun ${name} gagal: ${(e as Error).message.split("\n")[0]}`);
      await ctx.diagnose(page, `outbox-${acc.id}`);
    } finally {
      await page?.close().catch(() => {});
    }
  }
  const summary = ctx.opts.dryRun ? `${listed} invoice di Outbox siap dibuat kuitansi`
    : `${made} invoice dibuat kuitansi · ${batches} batch${failed.length ? ` · ${failed.length} gagal` : ""}`;
  if (failed.length) throw new Error(`${summary} — ${failed.slice(0, 3).join(" · ")}`);
  return { status: made || listed ? "ok" : "skipped", summary, rows: made || listed };
}

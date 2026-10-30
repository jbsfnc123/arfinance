// Invoice Inbox EDI Mitra 10 (menu Inbox, einvoice-inbox). Langkah awal sama dengan Upload Faktur (partner → Invoices → vendor).
// Dua mode (param inboxMode):
//   completed: Filter Status = Completed → berulang: centang SATU baris teratas yang Completed → Create Invoice → konfirmasi
//              (dialog diterima otomatis oleh ediPage) → baca SweetAlert → tabel dimuat ulang.
//   new:       Filter Status = New → berulang: klik Document No baris New teratas (getByDocId) → panel PFI → Accept →
//              konfirmasi (diterima otomatis = Enter) → baca SweetAlert → panel ditutup & tabel dimuat ulang (oleh EDI).
// Baris yang sudah dicoba tidak dipilih lagi. Uji coba: hanya mendaftar baris.
// Aksi tulis di situs luar: tanpa retry otomatis (runner) & tidak boleh masuk rangkaian terjadwal.
import type { Page } from "puppeteer-core";
import type { JobParams } from "~/shared/types";
import { delay, type RunContext } from "~/runner/ctx";
import type { JobOut } from "../jasper/jobs";
import { ediLogin, ediLogout, ediPage, openInvoices, pickAccounts } from "./session";
import { inboxLimit, inboxModeOf, isAcceptSuccess, isSuccess, MODE_STATUS, nextWithStatus, rowLabel, type InboxRow } from "./inbox-pick";

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

/** Filter Status = `status` (opsi dipilih berdasarkan teks; daftar status dimuat server). Klik Search. */
async function searchStatus(ctx: RunContext, page: Page, status: string) {
  await page.waitForFunction(() => (document.querySelector<HTMLSelectElement>("#statusPfi")?.options.length ?? 0) > 1, { timeout: 15_000 }).catch(() => {});
  const filtered = await page.evaluate((want: string) => {
    const s = document.querySelector<HTMLSelectElement>("#statusPfi");
    const o = s ? [...s.options].find((x) => (x.textContent ?? "").trim().toLowerCase() === want.toLowerCase()) : undefined;
    if (!s || !o) return false;
    s.value = o.value;
    s.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, status);
  ctx.info(filtered ? `Filter Status: ${status}.` : `Filter Status ${status} tidak tersedia — semua status ditampilkan, baris dicek satu per satu.`);
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
  const msg = await waitSwal(page);
  await page.evaluate(() => document.querySelector<HTMLElement>(".swal2-confirm")?.click());
  await settle(page);
  await showMany(page);
  return msg ?? "";
}

/** Tunggu SweetAlert tampil (maks. `ms`), kembalikan teksnya; null bila tidak muncul. */
async function waitSwal(page: Page, ms = 60_000) {
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

/**
 * Mode New: buka detail PFI (klik Document No = getByDocId) → klik Accept → konfirmasi diterima otomatis (Enter) → baca
 * SweetAlert → tutup. Sukses: EDI menutup panel & memuat ulang tabel sendiri; gagal: panel ditutup lewat tombol Close.
 */
async function acceptOne(page: Page, row: InboxRow) {
  await page.evaluate((id: string) => {
    const b = [...document.querySelectorAll<HTMLElement>("#pfiTable button[onclick*='getByDocId']")].find((x) => (x.getAttribute("onclick") ?? "").includes(`(${id})`));
    const w = window as unknown as { getByDocId?: (id: number) => void };
    if (b) b.click(); else if (typeof w.getByDocId === "function") w.getByDocId(Number(id));
  }, row.id);
  await page.waitForSelector(".panelPfi:not(.hidden)", { timeout: 20_000 });
  await page.waitForFunction((id: string) => document.querySelector<HTMLInputElement>("#pfiId")?.value?.trim() === id, { timeout: 20_000 }, row.id)
    .catch(() => { throw new Error("detail PFI tidak terbuka"); });
  await page.waitForSelector("#preloader", { hidden: true, timeout: 15_000 }).catch(() => {});
  await delay(800);
  const canAccept = await page.evaluate(() => { const b = document.querySelector<HTMLElement>(".panelPfi .btnAcceptGR"); return !!b && b.offsetParent !== null; });
  if (!canAccept) {
    await page.evaluate(() => document.querySelector<HTMLElement>(".panelPfi .backBtn")?.click());
    await settle(page);
    throw new Error("tombol Accept tidak tampil (status PFI bukan New?)");
  }
  // Dialog konfirmasi bawaan browser (confirm) diterima otomatis oleh handler `dialog` di ediPage (setara menekan Enter).
  await page.evaluate(() => document.querySelector<HTMLElement>(".panelPfi .btnAcceptGR")?.click());
  const msg = await waitSwal(page);
  await page.evaluate(() => document.querySelector<HTMLElement>(".swal2-confirm")?.click());
  await delay(800);
  // Gagal → panel masih terbuka: tutup agar baris berikutnya bisa dibuka.
  const open = await page.evaluate(() => { const p = document.querySelector<HTMLElement>(".panelPfi"); return !!p && !p.classList.contains("hidden"); });
  if (open) await page.evaluate(() => document.querySelector<HTMLElement>(".panelPfi .backBtn")?.click());
  await settle(page);
  await showMany(page);
  return msg ?? "";
}

export async function ediInvoiceInboxJob(ctx: RunContext, p: JobParams): Promise<JobOut> {
  const accounts = pickAccounts(ctx, p.accounts);
  const limit = inboxLimit(p.limit);
  const mode = inboxModeOf(p.inboxMode);
  const status = MODE_STATUS[mode];
  const act = mode === "new" ? "Accept" : "Create Invoice";
  ctx.info(`Mode ${status} (${act}) · ${accounts.length} akun · maks. ${limit} dokumen per akun${ctx.opts.dryRun ? ` · UJI COBA (tanpa ${act})` : ""}`);
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
      await searchStatus(ctx, page, status);
      const tried = new Set<string>(), logged = new Set<string>();
      let count = 0;
      while (count < limit) {
        ctx.check();
        const { row, skipped } = nextWithStatus(await readRows(page), tried, status);
        for (const s of skipped) if (!logged.has(s.id)) { logged.add(s.id); ctx.info(`  Dilewati (status ${s.status || "-"}): ${rowLabel(s)}`); }
        if (!row) break;
        tried.add(row.id);
        count++;
        if (ctx.opts.dryRun) { listed++; ctx.info(`  [${count}] Akan di-${mode === "new" ? "accept" : "buat invoice"}: ${rowLabel(row)}`); continue; }
        ctx.info(`  [${count}] ${act}: ${rowLabel(row)}…`);
        let msg = "";
        try { msg = mode === "new" ? await acceptOne(page, row) : await createOne(page, row.id); }
        catch (e) { msg = `Error: ${(e as Error).message.split("\n")[0]}`; }
        if (mode === "new" ? isAcceptSuccess(msg) : isSuccess(msg)) { made++; ctx.log("ok", `  ${row.docNo}: ${msg.replace(/\s+/g, " ")}`); }
        else { failed.push(`${row.docNo}: ${msg || "tanpa pesan"}`); ctx.warn(`  ${row.docNo} gagal: ${msg || "tidak ada pesan dari EDI"}`); }
      }
      if (count >= limit) ctx.warn(`Batas ${limit} dokumen per run tercapai untuk akun ${name}.`);
      if (!count) ctx.info(`Tidak ada baris berstatus ${status} di Inbox.`);
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
  const summary = ctx.opts.dryRun
    ? `${listed} baris ${status} siap ${mode === "new" ? "di-accept" : "dibuat invoice"}`
    : `${made} ${mode === "new" ? "PFI di-accept" : "invoice dibuat"}${failed.length ? ` · ${failed.length} gagal` : ""}`;
  if (failed.length) throw new Error(`${summary} — ${failed.slice(0, 5).join(" · ")}${failed.length > 5 ? " …" : ""}`);
  return { status: made || listed ? "ok" : "skipped", summary, rows: made || listed };
}

"use client";

// Data kerja Upload Faktur Pajak di browser (Fase 93): daftar faktur + PDF per faktur, data PO dari "Import to BOT", dan
// sheet Invoice (mode Isi No Invoice). Disimpan di IndexedDB lokal (lib/local/kv — dikosongkan saat logout), tidak di
// server. PDF hanya diunggah sementara ke bucket transit saat run dijalankan, lalu dihapus bot.
import { kvDel, kvGet, kvSet } from "@/lib/local/kv";
import { applyPoList, type FakturItem, type PoRow } from "@/lib/modules/m10/faktur";

const K = { sheet: "m10bot:faktur", po: "m10bot:po", inv: "m10bot:invoices", pdf: (f: string) => `m10bot:pdf:${f}` };

export type FakturSheet = { source: string | null; createdAt: string | null; totalPages: number; items: FakturItem[] };
export type PoList = { at: string; rows: PoRow[] };
export type InvoiceRow = { invoice: string; no_po: string; no_sj: string; open_amt: number; checked: boolean; status: string };

export const EMPTY_SHEET: FakturSheet = { source: null, createdAt: null, totalPages: 0, items: [] };

export const loadSheet = async () => (await kvGet<FakturSheet>(K.sheet)) ?? EMPTY_SHEET;
export const saveSheet = (s: FakturSheet) => kvSet(K.sheet, s);
export const loadPo = () => kvGet<PoList>(K.po);
export const loadInvoices = async () => (await kvGet<InvoiceRow[]>(K.inv)) ?? [];
export const saveInvoices = (rows: InvoiceRow[]) => kvSet(K.inv, rows);
export const loadPdf = (name: string) => kvGet<Blob>(K.pdf(name));

/** Ganti daftar faktur (PDF baru): PDF lama dihapus, data PO terakhir langsung diterapkan. */
export async function replaceSheet(sheet: FakturSheet, files: Map<string, Blob>) {
  const old = await loadSheet();
  for (const it of old.items) await kvDel(K.pdf(it.filename));
  for (const [name, blob] of files) await kvSet(K.pdf(name), blob);
  const po = await loadPo();
  const next = po?.rows.length ? { ...sheet, items: applyPoList(sheet.items, po.rows, { select: true }).items } : sheet;
  await saveSheet(next);
  return next;
}

export async function clearSheet() {
  const old = await loadSheet();
  for (const it of old.items) await kvDel(K.pdf(it.filename));
  await kvDel(K.sheet);
}

/**
 * Import to BOT (Kertas Kerja): simpan data PO (Invoice No, No PO, No SJ, Open Amt), terapkan ke daftar faktur (pilih cepat:
 * hanya invoice yang ada di data PO yang dicentang), dan jadikan sheet Invoice mode Isi No Invoice (data lama diganti).
 */
export async function importPo(rows: PoRow[]) {
  const clean = rows.filter((r) => r.invoice.trim());
  await kvSet(K.po, { at: new Date().toISOString(), rows: clean } satisfies PoList);
  const sheet = await loadSheet();
  let matched = 0;
  if (sheet.items.length) {
    const r = applyPoList(sheet.items, clean, { select: true });
    matched = r.matched;
    await saveSheet({ ...sheet, items: r.items });
  }
  const byInv = new Map<string, InvoiceRow>();
  for (const r of clean) byInv.set(r.invoice.trim().toUpperCase(), { invoice: r.invoice.trim(), no_po: r.no_po, no_sj: r.no_sj, open_amt: r.open_amt, checked: true, status: "Ready" });
  await saveInvoices([...byInv.values()]);
  return { rows: clean.length, matched, fakturItems: sheet.items.length };
}

/** Baris Kertas Kerja → data PO. */
export const toPoRows = (rows: { invoice_no: string | null; no_po: string | null; no_sj: string | null; open_amt: number | null }[]): PoRow[] =>
  rows.map((r) => ({ invoice: r.invoice_no ?? "", no_po: r.no_po ?? "", no_sj: r.no_sj ?? "", open_amt: Number(r.open_amt ?? 0) || 0 }));

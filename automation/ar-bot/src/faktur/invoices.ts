// Sheet "Invoice" Upload Faktur (mode Isi No Invoice): data No Invoice / No PO / No SJ / Open Amt sendiri, tanpa PDF faktur.
// Disimpan terpisah dari manifest faktur (data\work\faktur-invoice\invoices.json) — Kosongkan sheet Invoice+FP tidak menyentuhnya.
import fs from "node:fs";
import path from "node:path";
import { P, readJson, writeAtomic } from "~/core/paths";
import { parseAmount } from "./amount";
import { findPoColumns } from "./po";

export type InvoiceRow = { invoice: string; no_po: string; no_sj: string; open_amt: number; checked: boolean; status: string };
export type InvoiceSheet = { source: string | null; createdAt: string | null; items: InvoiceRow[] };

const DIR = path.join(P.work, "faktur-invoice");
const FILE = path.join(DIR, "invoices.json");

export const loadInvoices = (): InvoiceSheet => readJson<InvoiceSheet>(FILE) ?? { source: null, createdAt: null, items: [] };
export const saveInvoices = (s: InvoiceSheet) => { fs.mkdirSync(DIR, { recursive: true }); writeAtomic(FILE, JSON.stringify(s, null, 2)); };
export const clearInvoices = () => fs.rmSync(DIR, { recursive: true, force: true });

export function patchInvoice(invoice: string, patch: Partial<InvoiceRow>) {
  const s = loadInvoices();
  const it = s.items.find((i) => i.invoice === invoice);
  if (!it) throw new Error(`Invoice ${invoice} tidak ada di sheet Invoice.`);
  Object.assign(it, patch);
  saveInvoices(s);
  return it;
}

/** Status sukses mode Isi No Invoice (baris ini tidak diproses lagi). */
export const FILLED = "No Invoice Terisi";
export const isFilled = (s?: string) => !!s && s.startsWith(FILLED);

/**
 * Baris Excel Invoice (template sama dengan Excel PO: Invoice No, No PO, No SJ, Open Amt) → isi sheet baru (data lama diganti).
 * Baris tanpa No Invoice dilewati; No Invoice ganda → baris terakhir yang dipakai. Semua baris dicentang, status Ready.
 */
export function importInvoices(rows: unknown[][]): { items: InvoiceRow[]; skipped: number } {
  if (rows.length < 2) throw new Error("Data kosong atau hanya berisi header.");
  const c = findPoColumns(rows[0]);
  if (c.inv < 0) throw new Error("Kolom 'Invoice No' tidak ditemukan pada baris header.");
  if (c.po < 0) throw new Error("Kolom 'No PO' tidak ditemukan pada baris header.");
  const cell = (r: unknown[], i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");
  const byInv = new Map<string, InvoiceRow>();
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const invoice = cell(r, c.inv);
    if (!invoice) { if (r.some((x) => String(x ?? "").trim())) skipped++; continue; }
    byInv.set(invoice.toUpperCase(), {
      invoice, no_po: cell(r, c.po), no_sj: cell(r, c.sj), open_amt: c.amt >= 0 ? parseAmount(r[c.amt]) ?? 0 : 0, checked: true, status: "Ready",
    });
  }
  if (!byInv.size) throw new Error("Tidak ada baris berisi No Invoice.");
  return { items: [...byInv.values()], skipped };
}

/** Antrean mode Isi No Invoice: tercentang & belum terisi. */
export const invoiceQueue = (items: InvoiceRow[]) => items.filter((i) => i.checked && !isFilled(i.status));

/** Status sesudah Save Vendor Invoice No dari pesan SweetAlert (kosong = tidak ada pesan galat). */
export function fillStatus(msg: string, tag: string) {
  const m = msg.replace(/\s+/g, " ").trim();
  if (!m || /sukses|berhasil|success|tersimpan|saved/i.test(m)) return `${FILLED} · ${tag}`;
  return `Gagal Simpan: ${m}`.slice(0, 300);
}

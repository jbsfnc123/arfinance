// Cocokkan data No PO / No SJ / Open Amt (Excel, CSV, atau teks tempelan dari Excel) ke daftar faktur — port parse_po_excel.js.
import * as XLSX from "xlsx";
import type { FakturItem } from "./split";

/** Baris tabel dari file (xlsx/xls/csv) atau teks tempel (tab / ; / , dipisah). */
export function readPoRows(input: { buf: Buffer } | { text: string }): unknown[][] {
  const wb = "buf" in input ? XLSX.read(input.buf, { type: "buffer", cellDates: true, raw: false }) : XLSX.read(input.text, { type: "string", raw: false });
  const sh = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, defval: "" });
}

export function findPoColumns(header: unknown[]) {
  const h = header.map((c) => String(c ?? "").trim().toLowerCase());
  let inv = -1, po = -1, sj = -1, amt = -1;
  h.forEach((x, i) => {
    if (inv < 0 && (x.includes("invoice no") || x.includes("no invoice") || x.includes("referensi no invoice") || x === "invoice")) inv = i;
    else if (po < 0 && (x.includes("no po") || x.includes("po no") || x.includes("purchase order") || x === "po")) po = i;
    else if (sj < 0 && (x.includes("no sj") || x.includes("sj no") || x.includes("surat jalan") || x.includes("vendor shipment no") || x === "sj")) sj = i;
    else if (amt < 0 && (x.includes("open amt") || x.includes("open amount") || x.includes("amount") || x.includes("total amount") || x.includes("nilai"))) amt = i;
  });
  if (inv < 0) inv = h.findIndex((x) => x.includes("invoice"));
  return { inv, po, sj, amt };
}

const toAmount = (v: unknown) => typeof v === "number" ? Math.round(v) : Number(String(v ?? "").replace(/\D/g, "")) || 0;

/**
 * Terapkan ke `items` (salinan baru). Pencocokan No Invoice tanpa beda huruf besar/kecil.
 * `select` (pilih cepat): invoice yang ada di data PO dicentang, sisanya tidak. `in_po` menandai invoice dari data PO.
 */
export function applyPo(items: FakturItem[], rows: unknown[][], opts: { select?: boolean } = {}) {
  if (rows.length < 2) throw new Error("Data kosong atau hanya berisi header.");
  const c = findPoColumns(rows[0]);
  if (c.inv < 0) throw new Error("Kolom 'Invoice No' tidak ditemukan pada baris header.");
  const next = items.map((i) => ({ ...i, in_po: false }));
  const byInv = new Map(next.map((i) => [i.invoice.trim().toUpperCase(), i]));
  let matched = 0, excelRows = 0;
  const unmatched: string[] = [];
  for (const row of rows.slice(1)) {
    const inv = String(row[c.inv] ?? "").trim();
    if (!inv) continue;
    excelRows++;
    const it = byInv.get(inv.toUpperCase());
    if (!it) { unmatched.push(inv); continue; }
    if (!it.in_po) matched++;
    it.in_po = true;
    it.no_po = c.po >= 0 ? String(row[c.po] ?? "").trim() : "";
    it.no_sj = c.sj >= 0 ? String(row[c.sj] ?? "").trim() : "";
    it.open_amt = c.amt >= 0 ? toAmount(row[c.amt]) : 0;
  }
  if (opts.select) for (const it of next) it.checked = !!it.in_po;
  return { items: next, matched, dataRows: rows.length - 1, excelRows, unmatchedExcel: unmatched, notInPo: next.filter((i) => !i.in_po).length };
}

/**
 * Verifikasi mode "Not Found in Draft": cocokkan No SJ (angka saja) & Open Amt (toleransi Rp 500) dengan baris sub-invoice EDI.
 * Port logika bot_upload_faktur.js.
 */
export function verifySubInvoice(item: Pick<FakturItem, "no_sj" | "open_amt">, rows: { noSj: string; openAmt: string }[]) {
  const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
  const appSj = digits(item.no_sj), appAmt = Number(digits(item.open_amt));
  const amtOf = (r: { openAmt: string }) => Number(digits(r.openAmt));
  const near = (n: number) => !Number.isNaN(n) && !Number.isNaN(appAmt) && Math.abs(n - appAmt) <= 500;
  if (!rows.length) return { sjOk: false, amtOk: false };
  const sjRow = rows.find((r) => digits(r.noSj) === appSj && appSj !== "");
  if (sjRow) return { sjOk: true, amtOk: near(amtOf(sjRow)) };
  return { sjOk: false, amtOk: rows.some((r) => near(amtOf(r))) };
}

/** Status hasil verifikasi (sama dengan bot lama). */
export const verifyStatus = (v: { sjOk: boolean; amtOk: boolean }) =>
  v.sjOk && v.amtOk ? null : v.sjOk ? "Invoice Selisih" : v.amtOk ? "Cek Kode Barang" : "Data Tidak Cocok";

/** Satu dokumen Draft EDI hasil cari No PO: baris sub-invoice (Vendor Shipment No & Total Amount) + Vendor Invoice No saat ini. */
export type DraftDoc = { id: string; docNo: string; vendorInvoiceNo: string; rows: { noSj: string; openAmt: string }[] };
type PoItem = Pick<FakturItem, "invoice" | "no_sj" | "open_amt">;

const sameInv = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();
/** Dokumen boleh dipakai invoice ini: Vendor Invoice No masih kosong atau sudah berisi invoice yang sama (proses ulang). */
export const docFree = (d: DraftDoc, invoice: string) => !d.vendorInvoiceNo.trim() || sameInv(d.vendorInvoiceNo, invoice);
/** Dokumen ini jelas milik invoice tsb (SJ & nominal cocok, belum dipakai invoice lain) → tidak perlu membuka dokumen lain. */
export const docMatches = (item: PoItem, d: DraftDoc) => {
  const v = verifySubInvoice(item, d.rows);
  return v.sjOk && v.amtOk && docFree(d, item.invoice);
};

/**
 * Pilih dokumen Draft untuk invoice (mode Not Found in Draft / cari No PO). Satu PO bisa punya beberapa invoice & SJ, masing-
 * masing dokumen Draft sendiri: dokumen dipilih dari No SJ (angka saja) + Open Amt (toleransi Rp 500), lalu No Invoice milik
 * SJ itu yang diisi. Dokumen yang Vendor Invoice No-nya sudah berisi invoice lain dilewati. Satu dokumen → status bot lama.
 */
export function pickDraftDoc(item: PoItem, docs: DraftDoc[]): { doc: DraftDoc; sj: string } | { doc: null; status: string } {
  const sjOf = (d: DraftDoc) => d.rows.find((r) => verifySubInvoice(item, [r]).sjOk)?.noSj ?? "";
  const v = (d: DraftDoc) => verifySubInvoice(item, d.rows);
  if (!docs.length) return { doc: null, status: "Not Found in Draft (PO)" };
  if (docs.length === 1) {
    const d = docs[0];
    const bad = verifyStatus(v(d));
    if (bad) return { doc: null, status: bad };
    if (!docFree(d, item.invoice)) return { doc: null, status: `Dokumen ${d.docNo} sudah berisi invoice ${d.vendorInvoiceNo.trim()}` };
    return { doc: d, sj: sjOf(d) };
  }
  const free = docs.filter((d) => docFree(d, item.invoice));
  const bySj = free.filter((d) => v(d).sjOk);
  const ok = bySj.filter((d) => v(d).amtOk);
  if (ok.length) {
    const d = ok.find((x) => sameInv(x.vendorInvoiceNo, item.invoice)) ?? ok[0];
    return { doc: d, sj: sjOf(d) };
  }
  if (bySj.length) return { doc: null, status: `Invoice Selisih (${bySj[0].docNo})` };
  const used = docs.find((d) => !docFree(d, item.invoice) && v(d).sjOk);
  if (used) return { doc: null, status: `SJ sudah dipakai invoice ${used.vendorInvoiceNo.trim()} (${used.docNo})` };
  if (free.some((d) => v(d).amtOk)) return { doc: null, status: `Cek Kode Barang (${docs.length} dokumen PO)` };
  return { doc: null, status: `SJ Tidak Ditemukan di PO (${docs.length} dokumen)` };
}

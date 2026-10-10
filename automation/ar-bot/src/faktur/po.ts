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

/** Terapkan ke `items` (salinan baru). Pencocokan No Invoice tanpa beda huruf besar/kecil. */
export function applyPo(items: FakturItem[], rows: unknown[][]) {
  if (rows.length < 2) throw new Error("Data kosong atau hanya berisi header.");
  const c = findPoColumns(rows[0]);
  if (c.inv < 0) throw new Error("Kolom 'Invoice No' tidak ditemukan pada baris header.");
  const next = items.map((i) => ({ ...i }));
  const byInv = new Map(next.map((i) => [i.invoice.trim().toUpperCase(), i]));
  let matched = 0;
  for (const row of rows.slice(1)) {
    const inv = String(row[c.inv] ?? "").trim();
    if (!inv) continue;
    const it = byInv.get(inv.toUpperCase());
    if (!it) continue;
    it.no_po = c.po >= 0 ? String(row[c.po] ?? "").trim() : "";
    it.no_sj = c.sj >= 0 ? String(row[c.sj] ?? "").trim() : "";
    it.open_amt = c.amt >= 0 ? toAmount(row[c.amt]) : 0;
    matched++;
  }
  return { items: next, matched, dataRows: rows.length - 1 };
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

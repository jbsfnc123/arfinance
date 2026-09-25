import { parseDate } from "@/lib/parsers/date";
import { parseNumber } from "@/lib/parsers/number";

// Port macro Mitra10 Tukar Faktur: modAging (UpdateMasterAging), modGR (UploadCSV + CleanSJ +
// Update_GR_Data), modKwitansi (UpdateDataKwitansi) dan tabel manual tblJadwal / tblAdd.

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const key = (v: unknown) => text(v).toLowerCase();
// Excel error (#N/A) & teks "null" → kosong (seperti modAging).
const clean = (v: unknown) => {
  const s = text(v);
  return /^#(n\/a|value!|ref!|div\/0!|name\?|num!|null!)$/i.test(s) || s.toLowerCase() === "null" ? "" : v;
};
const num = (v: unknown) => parseNumber(clean(v));
const str = (v: unknown) => text(clean(v));
const date = (v: unknown) => parseDate(clean(v));
const int = (v: unknown) => {
  const s = str(v);
  return s === "" ? null : Math.round(parseNumber(s));
};

// ── Aging ─────────────────────────────────────────────────────────
export type AgingRow = {
  payment_group: string; marketing: string; collection_name: string; sales_name: string;
  business_partner: string; tax_name: string; invoice_no: string; invoice_date: string | null;
  due_date: string | null; open_amt: number; cur_0_30: number; cur_31_60: number; due_1_7: number;
  due_8_30: number; due_31_60: number; due_61_90: number; due_90: number; days: number | null;
  branch: string; no_po: string; no_sj: string;
};

const AGING_HEADERS: Record<keyof AgingRow, string> = {
  payment_group: "Payment Group", marketing: "Marketing", collection_name: "Collection Name",
  sales_name: "Sales Name", business_partner: "Business Partner", tax_name: "Tax Name",
  invoice_no: "Invoice No", invoice_date: "Invoice Date", due_date: "Due Date", open_amt: "Open Amt",
  cur_0_30: "Current 0 - 30", cur_31_60: "Current 31 - 60", due_1_7: "Due + 1 - 7",
  due_8_30: "Due + 8 - 30", due_31_60: "Due + 31 - 60", due_61_90: "Due + 61 - 90", due_90: "Due + > 90",
  days: "Days", branch: "Branch", no_po: "No PO", no_sj: "No SJ",
};
const NUM_FIELDS = new Set<keyof AgingRow>(["open_amt", "cur_0_30", "cur_31_60", "due_1_7", "due_8_30", "due_31_60", "due_61_90", "due_90"]);
const DATE_FIELDS = new Set<keyof AgingRow>(["invoice_date", "due_date"]);

// Header dipetakan berdasarkan nama (tidak peka huruf besar/kecil & spasi tepi).
// Filter Tax Name = taxName. Wajib ada: Tax Name, Invoice No, No SJ.
export function parseAging(rows: unknown[][], taxName: string) {
  const want = key(taxName);
  let headerRow = -1;
  let idx = new Map<string, number>();
  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const m = new Map<string, number>();
    (rows[r] ?? []).forEach((c, i) => { const k = key(c); if (k && !m.has(k)) m.set(k, i); });
    if (m.has("tax name") && m.has("invoice no") && m.has("no sj")) { headerRow = r; idx = m; break; }
  }
  if (headerRow < 0) throw new Error("Header 'Tax Name' / 'Invoice No' / 'No SJ' tidak ditemukan di file aging.");

  const col = Object.fromEntries(
    (Object.keys(AGING_HEADERS) as (keyof AgingRow)[]).map((f) => [f, idx.get(key(AGING_HEADERS[f])) ?? -1]),
  ) as Record<keyof AgingRow, number>;

  const out: AgingRow[] = [];
  for (const r of rows.slice(headerRow + 1)) {
    if (key(r?.[col.tax_name]) !== want) continue;
    const row = {} as Record<keyof AgingRow, unknown>;
    for (const f of Object.keys(col) as (keyof AgingRow)[]) {
      const v = col[f] >= 0 ? r[col[f]] : "";
      row[f] = NUM_FIELDS.has(f) ? num(v) : DATE_FIELDS.has(f) ? date(v) : f === "days" ? int(v) : str(v);
    }
    out.push(row as AgingRow);
  }
  if (!out.length) throw new Error(`Tidak ada baris dengan Tax Name = '${taxName}' di file aging.`);
  return out;
}

// ── GR ────────────────────────────────────────────────────────────
export function toRoman(n: number) {
  const vals: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of vals) while (n >= v) { out += s; n -= v; }
  return out;
}

// Vendor Ship No → SJ/ddddd/<tahun romawi>/TRA (digit minimal 5, tahun = tahun berjalan mod 100).
export function cleanSj(shipNo: string, year: number) {
  const digits = text(shipNo).replace(/\D/g, "");
  if (!digits) return "";
  return `SJ/${digits.padStart(5, "0")}/${toRoman(year % 100)}/TRA`;
}

export type GrRow = {
  no: string; store_no: string; delivery_to: string; gr_no: string; gr_date: string; po_no: string;
  po_date: string; vendor_ship_no: string; item_code: string; item_name: string; uom: string;
  qty_order: number; qty_received: number; status: string; sj_no: string;
};

// CSV pemisah ";" dibaca per baris seperti macro (tanpa dukungan ";" di dalam kutip);
// tanda kutip pembungkus dibuang.
const csvLines = (csv: string) => csv.replace(/^﻿/, "").split(/\r\n|\r|\n/).filter((l) => l.trim() !== "");
const unquote = (s: string | undefined) => text(s).replace(/^"(.*)"$/, "$1").trim();

// GR_Report_Detail.csv: baris 1 header, 14 kolom A..N. Kunci unik GR No + Item Code
// (duplikat dalam file dibuang di sini; duplikat dengan data lama dibuang di database).
export function parseGrCsv(csv: string, year: number) {
  const lines = csvLines(csv);
  const seen = new Set<string>();
  const rows: GrRow[] = [];
  let sjCount = 0;
  for (const line of lines.slice(1)) {
    const p = line.split(";").map(unquote);
    const row: GrRow = {
      no: p[0] ?? "", store_no: p[1] ?? "", delivery_to: p[2] ?? "", gr_no: p[3] ?? "", gr_date: p[4] ?? "",
      po_no: p[5] ?? "", po_date: p[6] ?? "", vendor_ship_no: p[7] ?? "", item_code: p[8] ?? "",
      item_name: p[9] ?? "", uom: p[10] ?? "", qty_order: parseNumber(p[11]), qty_received: parseNumber(p[12]),
      status: p[13] ?? "", sj_no: cleanSj(p[7] ?? "", year),
    };
    if (!row.gr_no && !row.item_code) continue;
    const k = `${row.gr_no}|${row.item_code}`.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    if (row.sj_no) sjCount++;
    rows.push(row);
  }
  return { rows, lines: Math.max(lines.length - 1, 0), sjCount };
}

// ── Kwitansi ──────────────────────────────────────────────────────
export type KwRow = {
  invoice_no: string; vendor_invoice_no: string; invoice_date: string | null; kuitansi_no: string;
  kuitansi_date: string | null; accepted_date: string | null; pfi_no: string; gr_no: string; po_no: string;
  total_net: number;
};

// Invoice_Summary.csv: baris 1 header; kolom 2..11 (≥ 11 kolom). Invoice No = kolom 2.
export function parseKwCsv(csv: string) {
  const lines = csvLines(csv);
  const seen = new Set<string>();
  const rows: KwRow[] = [];
  let dupInFile = 0;
  for (const line of lines.slice(1)) {
    const p = line.split(";").map(unquote);
    if (p.length < 11) continue;
    const inv = p[1];
    if (!inv) continue;
    if (seen.has(inv.toLowerCase())) { dupInFile++; continue; }
    seen.add(inv.toLowerCase());
    rows.push({
      invoice_no: inv, vendor_invoice_no: p[2], invoice_date: parseDate(p[3]), kuitansi_no: p[4],
      kuitansi_date: parseDate(p[5]), accepted_date: parseDate(p[6]), pfi_no: p[7], gr_no: p[8], po_no: p[9],
      total_net: parseNumber(p[10]),
    });
  }
  return { rows, dupInFile };
}

// ── Tabel manual (Excel) ─────────────────────────────────────────
function headerMap(rows: unknown[][], required: string[]) {
  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const m = new Map<string, number>();
    (rows[r] ?? []).forEach((c, i) => { const k = key(c); if (k && !m.has(k)) m.set(k, i); });
    if (required.every((h) => m.has(h))) return { row: r, m };
  }
  return null;
}

export type ScheduleRow = { no_kw: string; spp: string; nilai_kw: number; tgl_tukar_faktur: string | null; jadwal_transfer: string | null; notes: string };

// Sheet "Jadwal bayar": NO KW, SPP, NILAI KW, TGL TUKAR FAKTUR, JADWAL TRANSFER, Notes.
export function parseSchedule(rows: unknown[][]) {
  const h = headerMap(rows, ["no kw", "jadwal transfer"]);
  if (!h) throw new Error("Header 'NO KW' / 'JADWAL TRANSFER' tidak ditemukan.");
  const g = (r: unknown[], name: string) => (h.m.has(name) ? r[h.m.get(name)!] : "");
  return rows.slice(h.row + 1)
    .map((r): ScheduleRow => ({
      no_kw: str(g(r, "no kw")), spp: str(g(r, "spp")), nilai_kw: num(g(r, "nilai kw")),
      tgl_tukar_faktur: date(g(r, "tgl tukar faktur")), jadwal_transfer: date(g(r, "jadwal transfer")),
      notes: str(g(r, "notes")),
    }))
    .filter((r) => r.no_kw);
}

export type BpUserRow = { business_partner: string; payment_group: string; username: string };

// Tabel "Add": Business Partner, Payment Group, Username.
export function parseBpUsers(rows: unknown[][]) {
  const h = headerMap(rows, ["business partner", "username"]);
  if (!h) throw new Error("Header 'Business Partner' / 'Username' tidak ditemukan.");
  const g = (r: unknown[], name: string) => (h.m.has(name) ? r[h.m.get(name)!] : "");
  return rows.slice(h.row + 1)
    .map((r): BpUserRow => ({ business_partner: str(g(r, "business partner")), payment_group: str(g(r, "payment group")), username: str(g(r, "username")) }))
    .filter((r) => r.business_partner);
}

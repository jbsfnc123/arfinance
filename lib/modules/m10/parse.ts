import { parseDate } from "@/lib/parsers/date";
import { parseNumber } from "@/lib/parsers/number";

// Port macro Mitra10 Tukar Faktur (aging kini lewat laporan bersama lib/uploads): modGR (UploadCSV + CleanSJ +
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

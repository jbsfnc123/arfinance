import { agingOf, AGING_BUCKETS, type AgingBucket } from "./aging";
import { fmtDate, monthKey } from "@/lib/format";

// Logika tampilan halaman Collection, di-port dari Aplikasi Utama/Script.html
// (renderCollAgingCards, rekap tukar/jatuh tempo, rowPassesOtherFilters, kategori).

// Baris collection (hasil lib/modules/collection/rows.ts#collectionRows).
export type RawRow = {
  invoice_no: string | null; payment_group: string | null; marketing: string | null; collection_name: string | null;
  business_partner: string | null; bp_value: string | null; invoice_date: string | null; due_date: string | null;
  open_amt: number | null; no_po: string | null; no_sj: string | null; catatan: string | null; janji_bayar: string | null;
  metode_tukar: string | null; tanggal_tukar: string | null; keterangan: string | null; resi: string | null; foto_path: string | null;
  keterangan_tukar?: string | null; // keterangan/resi dari sumber tukar faktur (internal, untuk No Resi)
};

export type CollectionRow = {
  invoice_no: string;
  payment_group: string;
  marketing: string;
  collection_name: string;
  business_partner: string;
  bp_value: string;
  invoice_date: string | null;
  due_date: string | null;
  open_amt: number;
  no_po: string;
  no_sj: string;
  catatan: string;
  janji_bayar: string | null;
  metode_tukar: string | null;
  tanggal_tukar: string | null;
  keterangan: string;     // Keterangan invoice bersama (Collection = Mitra10 = Hold Faktur)
  ket_tukar: string;      // keterangan sumber tukar faktur (internal)
  resi: string;
  foto_path: string | null;
  // turunan
  days: number | null;
  aging: AgingBucket;
  search: string;
};

export const TUKAR_METHODS = ["Kolektor", "Ekspedisi", "Sistem", "WA", "Email"] as const;

export function enrichRow(r: RawRow, today: string): CollectionRow {
  const { days, bucket } = agingOf(r.due_date, today);
  const row = {
    invoice_no: r.invoice_no ?? "",
    payment_group: r.payment_group ?? "",
    marketing: r.marketing ?? "",
    collection_name: r.collection_name ?? "",
    business_partner: r.business_partner ?? "",
    bp_value: r.bp_value ?? "",
    invoice_date: r.invoice_date,
    due_date: r.due_date,
    open_amt: Number(r.open_amt) || 0,
    no_po: r.no_po ?? "",
    no_sj: r.no_sj ?? "",
    catatan: r.catatan ?? "",
    janji_bayar: r.janji_bayar,
    metode_tukar: r.metode_tukar,
    tanggal_tukar: r.tanggal_tukar,
    keterangan: r.keterangan ?? "",
    ket_tukar: r.keterangan_tukar ?? "",
    resi: r.resi ?? "",
    foto_path: r.foto_path,
    days,
    aging: bucket,
    search: "",
  };
  return withSearch(row);
}

// Teks pencarian = semua nilai yang tampil (seperti _searchStr lama).
export function withSearch(row: CollectionRow): CollectionRow {
  const parts = COLUMN_DEFS.map((c) => cellText(row, c.key));
  return { ...row, search: parts.join(" ").toLowerCase() };
}

// Record tukar faktur baru menang bila sumbernya lebih prioritas, atau baris belum punya.
export function applyExchange(
  row: CollectionRow,
  ex: { metode: string; tanggal: string; keterangan: string | null; resi: string | null; foto_path: string | null },
): CollectionRow {
  const rank = (m: string | null) => (m ? TUKAR_METHODS.indexOf(m as (typeof TUKAR_METHODS)[number]) : 99);
  if (rank(ex.metode) >= rank(row.metode_tukar)) return row;
  return withSearch({
    ...row,
    metode_tukar: ex.metode,
    tanggal_tukar: ex.tanggal,
    ket_tukar: ex.keterangan ?? ex.resi ?? "",
    resi: ex.resi ?? "",
    foto_path: ex.foto_path,
  });
}

// ── Kolom tabel ─────────────────────────────────────────────────────
export type ColumnKey =
  | "payment_group" | "marketing" | "business_partner" | "invoice_no" | "invoice_date" | "due_date"
  | "janji_bayar" | "aging" | "open_amt" | "bp_value" | "no_po" | "no_sj"
  | "tanggal_tukar" | "metode_tukar" | "status_tukar" | "keterangan" | "no_resi";

export const COLUMN_DEFS: { key: ColumnKey; label: string; default?: boolean; money?: boolean }[] = [
  { key: "payment_group", label: "Payment Group" },
  { key: "marketing", label: "Marketing" },
  { key: "business_partner", label: "Business Partner", default: true },
  { key: "invoice_no", label: "No Invoice", default: true },
  { key: "invoice_date", label: "Invoice Date", default: true },
  { key: "due_date", label: "Due Date", default: true },
  { key: "janji_bayar", label: "Janji Bayar", default: true },
  { key: "aging", label: "Aging", default: true },
  { key: "open_amt", label: "Nominal", default: true, money: true },
  { key: "bp_value", label: "Value" },
  { key: "no_po", label: "No PO" },
  { key: "no_sj", label: "No SJ" },
  { key: "tanggal_tukar", label: "Tgl Tukar Faktur" },
  { key: "metode_tukar", label: "Metode Tukar Faktur" },
  { key: "status_tukar", label: "Status Tukar Faktur" },
  { key: "keterangan", label: "Keterangan", default: true },
  { key: "no_resi", label: "No Resi (Ekspedisi)" },
];

export const DEFAULT_COLUMNS = COLUMN_DEFS.filter((c) => c.default).map((c) => c.key);

export const statusTukar = (r: CollectionRow) => (r.metode_tukar ? "Sudah Tukar Faktur" : "Belum Tukar Faktur");
export const noResi = (r: CollectionRow) => (r.metode_tukar === "Ekspedisi" ? r.resi || r.ket_tukar : "");

export function cellText(r: CollectionRow, key: ColumnKey): string {
  switch (key) {
    case "invoice_date":
    case "due_date":
    case "janji_bayar":
    case "tanggal_tukar":
      return fmtDate(r[key]);
    case "open_amt":
      return String(r.open_amt);
    case "status_tukar":
      return statusTukar(r);
    case "no_resi":
      return noResi(r);
    case "metode_tukar":
      return r.metode_tukar ?? "";
    default:
      return String(r[key] ?? "");
  }
}

// ── Filter ─────────────────────────────────────────────────────────
export const CATEGORY_CARDS = ["Case", "Janji Bayar", "Reminder", "No Respon", "Tidak Ada Catatan"] as const;
export type CategoryFilter = (typeof CATEGORY_CARDS)[number] | "Administratif";

export type Filters = {
  search: string;
  pg: string;
  bp: string;
  aging: AgingBucket | "Sudah Jatuh Tempo" | "";
  category: CategoryFilter | "";
  due: string | null; // "YYYY-MM" atau "__KOSONG__"
  dateFrom: string;
  dateTo: string;
};

export const EMPTY_FILTERS: Filters = {
  search: "", pg: "", bp: "", aging: "", category: "", due: null, dateFrom: "", dateTo: "",
};

export function categoryOf(catatan: string): string {
  const m = /^\[([^\]]+)\]/.exec(catatan);
  return m && ["Case", "Reminder", "No Respon", "Administratif"].includes(m[1]) ? m[1] : "Tidak Ada Catatan";
}

function passes(r: CollectionRow, f: Filters, skip: "pg" | "bp" | null) {
  if (f.search && !r.search.includes(f.search.toLowerCase())) return false;
  if (skip !== "pg" && f.pg && r.payment_group !== f.pg) return false;
  if (f.aging) {
    if (f.aging === "Sudah Jatuh Tempo") {
      if (r.aging === "Belum Jatuh Tempo" || r.aging === "-") return false;
    } else if (r.aging !== f.aging) return false;
  }
  if (f.category) {
    if (f.category === "Janji Bayar") {
      if (!r.janji_bayar) return false;
    } else if (f.category === "Tidak Ada Catatan") {
      if (r.catatan) return false;
    } else if (!r.catatan.startsWith(`[${f.category}]`)) return false;
  }
  if (f.due !== null) {
    const key = r.due_date ? monthKey(r.due_date) : "__KOSONG__";
    if (key !== f.due) return false;
  }
  if (f.dateFrom || f.dateTo) {
    if (!r.invoice_date) return false;
    if (f.dateFrom && r.invoice_date < f.dateFrom) return false;
    if (f.dateTo && r.invoice_date > f.dateTo) return false;
  }
  if (skip !== "bp" && f.bp && r.business_partner !== f.bp) return false;
  return true;
}

export function filterRows(rows: CollectionRow[], f: Filters) {
  return rows.filter((r) => passes(r, f, null));
}

// Opsi dropdown Payment Group / BP dihitung dari baris yang lolos filter lain.
export function optionCounts(rows: CollectionRow[], f: Filters, field: "pg" | "bp") {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!passes(r, f, field)) continue;
    const v = field === "pg" ? r.payment_group : r.business_partner;
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

// ── Ringkasan ──────────────────────────────────────────────────────
type Agg = { count: number; nominal: number };
const add = (a: Agg, r: CollectionRow) => ({ count: a.count + 1, nominal: a.nominal + r.open_amt });

export function agingCards(rows: CollectionRow[]) {
  const out: Record<string, Agg> = { "Sudah Jatuh Tempo": { count: 0, nominal: 0 } };
  for (const b of AGING_BUCKETS) out[b] = { count: 0, nominal: 0 };
  for (const r of rows) {
    if (r.aging === "-") continue;
    out[r.aging] = add(out[r.aging], r);
    if (r.aging !== "Belum Jatuh Tempo") out["Sudah Jatuh Tempo"] = add(out["Sudah Jatuh Tempo"], r);
  }
  return out;
}

// Per bulan due date, terbaru di atas, "Tanpa Tanggal" paling bawah.
export function dueRecap(rows: CollectionRow[]) {
  const map = new Map<string, Agg>();
  let total: Agg = { count: 0, nominal: 0 };
  for (const r of rows) {
    const key = r.due_date ? monthKey(r.due_date) : "__KOSONG__";
    map.set(key, add(map.get(key) ?? { count: 0, nominal: 0 }, r));
    total = add(total, r);
  }
  const months = [...map.entries()]
    .map(([key, agg]) => ({ key, ...agg }))
    .sort((a, b) => (a.key === "__KOSONG__" ? 1 : b.key === "__KOSONG__" ? -1 : b.key.localeCompare(a.key)));
  return { months, total };
}

// Kartu kategori. "Janji Bayar" dihitung terpisah (bisa tumpang tindih), seperti versi lama.
export function categoryCounts(rows: CollectionRow[]) {
  const out: Record<string, Agg> = {};
  for (const c of [...CATEGORY_CARDS, "Administratif"]) out[c] = { count: 0, nominal: 0 };
  for (const r of rows) {
    if (r.janji_bayar) out["Janji Bayar"] = add(out["Janji Bayar"], r);
    const c = categoryOf(r.catatan);
    out[c] = add(out[c], r);
  }
  return out;
}

// Untuk print/export: dikelompokkan per BP (urut abjad), baris sesuai urutan pilih.
export function groupByBp(rows: CollectionRow[]) {
  const map = new Map<string, CollectionRow[]>();
  for (const r of rows) {
    const list = map.get(r.business_partner) ?? [];
    list.push(r);
    map.set(r.business_partner, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bp, items]) => ({ bp, items, subtotal: items.reduce((s, r) => s + r.open_amt, 0) }));
}

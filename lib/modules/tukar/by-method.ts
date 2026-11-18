import type { TfDone } from "@/lib/local/datasets";
import { daysBetween } from "@/lib/parsers/date";

// Dashboard Tukar Faktur per metode (Fase 81). Sumber: pack_tf_summary — satu baris per invoice yang SUDAH tukar faktur
// (metode prioritas Kolektor > Ekspedisi > Sistem/WA/Email > Kwitansi EDI). Bulan = bulan TANGGAL TUKAR FAKTUR.
// Ukuran dashboard = JUMLAH INVOICE (Fase 81b). Tanpa perbandingan antarbulan (Fase 81c); setiap angka bisa diklik → rincian (Fase 81d): data hanya memuat invoice yang
// masih tercatat (lunas bisa hilang), jadi jumlah bulan lampau tidak setara untuk dibandingkan.
// Nominal tetap dibawa untuk kolom tersembunyi di rincian: EDI Mitra10 = total Kwitansi; lainnya = ERP / Aging.

export type MethodKey = "kolektor" | "ekspedisi" | "edi" | "lainnya";
export const METHODS: { key: MethodKey; label: string; hint: string }[] = [
  { key: "kolektor", label: "Kolektor", hint: "Aplikasi Kolektor / Daftar Tagihan › Tukar Faktur (Kolektor)" },
  { key: "ekspedisi", label: "Ekspedisi", hint: "Tukar faktur lewat ekspedisi (No Resi)" },
  { key: "edi", label: "EDI Mitra10", hint: "Kwitansi EDI Mitra 10 · tanggal = Kuitansi Date" },
  { key: "lainnya", label: "Lainnya", hint: "WA / Email / Sistem" },
];
export const methodLabel = (k: MethodKey) => METHODS.find((m) => m.key === k)!.label;

export function methodOf(metode: string | null | undefined): MethodKey {
  const m = (metode ?? "").trim().toLowerCase();
  if (m === "kolektor") return "kolektor";
  if (m === "ekspedisi") return "ekspedisi";
  if (m === "kwitansi edi") return "edi";
  return "lainnya";
}

export type TfDoneRow = TfDone & { key: string; method: MethodKey; metode_label: string; bulan: string; hari: number | null };

/** Baris siap tampil: metode terpetakan, bulan TF, lama hari (Tgl TF − Invoice Date, ≥ 0). */
export function prepareRows(rows: TfDone[]): TfDoneRow[] {
  return rows.filter((r) => r.tanggal && r.invoice_no).map((r) => {
    const method = methodOf(r.metode);
    const d = r.invoice_date ? daysBetween(r.tanggal, r.invoice_date) : null;
    return {
      ...r, key: r.invoice_no, method, metode_label: method === "lainnya" ? r.metode : methodLabel(method),
      bulan: r.tanggal.slice(0, 7), hari: d !== null && d >= 0 ? d : null,
      nominal: r.nominal === null || r.nominal === undefined ? null : Number(r.nominal),
    };
  });
}

export type Cell = { inv: number; bp: number; avgHari: number | null };
export type MonthRow = { month: string; by: Record<MethodKey, Cell>; total: Cell };

const avg1 = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function cellOf(rows: TfDoneRow[]): Cell {
  const bp = new Set<string>(), hari: number[] = [];
  for (const r of rows) {
    if (r.business_partner) bp.add(r.business_partner.trim().toLowerCase());
    if (r.hari !== null) hari.push(r.hari);
  }
  return { inv: rows.length, bp: bp.size, avgHari: avg1(hari) };
}

/** Ringkasan per bulan TF (terbaru dulu): per metode + total. */
export function monthlySummary(rows: TfDoneRow[]): MonthRow[] {
  const byMonth = new Map<string, TfDoneRow[]>();
  for (const r of rows) byMonth.set(r.bulan, [...(byMonth.get(r.bulan) ?? []), r]);
  return [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, rs]) => ({
    month,
    by: Object.fromEntries(METHODS.map((m) => [m.key, cellOf(rs.filter((r) => r.method === m.key))])) as Record<MethodKey, Cell>,
    total: cellOf(rs),
  }));
}

/** Hari di bulan `month` (YYYY-MM) dan hari yang sudah berjalan per `today` (bulan lampau = penuh, bulan depan = 0). */
export function monthDays(month: string, today: string) {
  const [y, m] = month.split("-").map(Number);
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ym = today.slice(0, 7);
  const elapsed = month < ym ? total : month > ym ? 0 : Number(today.slice(8, 10));
  return { total, elapsed, running: month === ym };
}

/** Rata-rata invoice per hari kalender yang sudah berjalan (1 desimal). */
export const perDay = (inv: number, month: string, today: string) => {
  const { elapsed } = monthDays(month, today);
  return elapsed ? Math.round((inv / elapsed) * 10) / 10 : null;
};

/** Perkiraan jumlah akhir bulan bila laju tetap — hanya bulan berjalan (bulan lampau sudah final → null). */
export function projection(inv: number, month: string, today: string): number | null {
  const { total, elapsed, running } = monthDays(month, today);
  if (!running || !elapsed) return null;
  return Math.round((inv / elapsed) * total);
}

export type Breakdown = { name: string; inv: number; share: number; bp: number; avgHari: number | null };

/** Per kelompok untuk satu metode: Kolektor per nama kolektor, Ekspedisi per Collection, lainnya per metode asli. */
export function breakdownStats(rows: TfDoneRow[], method: MethodKey): Breakdown[] {
  const name = (r: TfDoneRow) => (method === "kolektor" ? r.kurir : method === "ekspedisi" ? r.collection_name : method === "lainnya" ? r.metode : r.business_partner)?.trim() || "(tanpa nama)";
  const groups = new Map<string, TfDoneRow[]>();
  const own = rows.filter((r) => r.method === method);
  for (const r of own) groups.set(name(r), [...(groups.get(name(r)) ?? []), r]);
  return [...groups.entries()].map(([n, rs]) => {
    const c = cellOf(rs);
    return { name: n, inv: c.inv, share: own.length ? c.inv / own.length : 0, bp: c.bp, avgHari: c.avgHari };
  }).sort((a, b) => b.inv - a.inv || a.name.localeCompare(b.name, "id"));
}

/** Filter rincian (drill-down): invoice bulan `month`, opsional satu metode dan/atau satu nama kolektor. */
export function drillRows(rows: TfDoneRow[], f: { month: string; method?: MethodKey; kurir?: string }): TfDoneRow[] {
  const name = (r: TfDoneRow) => r.kurir?.trim() || "(tanpa nama)";
  return rows.filter((r) => r.bulan === f.month && (!f.method || r.method === f.method) && (f.kurir === undefined || name(r) === f.kurir));
}

/** Judul modal rincian, mis. "Tukar Faktur · Kolektor Karnadi · November 2026 (s/d 18)". */
export function drillTitle(f: { monthName: string; method?: MethodKey; kurir?: string }) {
  const who = f.kurir !== undefined ? `Kolektor ${f.kurir}` : f.method ? methodLabel(f.method) : "Semua metode";
  return `Tukar Faktur · ${who} · ${f.monthName}`;
}

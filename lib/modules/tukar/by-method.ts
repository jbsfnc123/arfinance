import type { TfDone } from "@/lib/local/datasets";
import { daysBetween } from "@/lib/parsers/date";

// Dashboard Tukar Faktur per metode (Fase 81). Sumber: pack_tf_summary — satu baris per invoice yang SUDAH tukar faktur
// (metode prioritas Kolektor > Ekspedisi > Sistem/WA/Email > Kwitansi EDI). Bulan = bulan TANGGAL TUKAR FAKTUR.
// Ukuran dashboard = JUMLAH INVOICE (Fase 81b). Nominal tetap dibawa untuk kolom tersembunyi di rincian:
// EDI Mitra10 = total Kwitansi; metode lain = amount invoice ERP / Open Amt Aging (bisa kosong).

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

export type Cell = { inv: number; nominal: number; noNominal: number; bp: number; avgHari: number | null };
export type MonthRow = { month: string; by: Record<MethodKey, Cell>; total: Cell };

const avg1 = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function cellOf(rows: TfDoneRow[]): Cell {
  let nominal = 0, noNominal = 0;
  const bp = new Set<string>(), hari: number[] = [];
  for (const r of rows) {
    if (r.nominal === null) noNominal++; else nominal += r.nominal;
    if (r.business_partner) bp.add(r.business_partner.trim().toLowerCase());
    if (r.hari !== null) hari.push(r.hari);
  }
  return { inv: rows.length, nominal, noNominal, bp: bp.size, avgHari: avg1(hari) };
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

/** Perubahan relatif (null bila pembanding 0/tidak ada). */
export const growth = (now: number, prev: number | undefined) => (prev ? (now - prev) / prev : null);

/** Rincian per kelompok untuk kartu metode: Kolektor per kurir, Ekspedisi per Collection, lainnya per metode asli. */
export function breakdown(rows: TfDoneRow[], method: MethodKey): { name: string; inv: number; nominal: number }[] {
  const name = (r: TfDoneRow) => (method === "kolektor" ? r.kurir : method === "ekspedisi" ? r.collection_name : method === "lainnya" ? r.metode : r.business_partner)?.trim() || "(tanpa nama)";
  const m = new Map<string, { name: string; inv: number; nominal: number }>();
  for (const r of rows) {
    if (r.method !== method) continue;
    const k = name(r), cur = m.get(k) ?? { name: k, inv: 0, nominal: 0 };
    cur.inv++; cur.nominal += r.nominal ?? 0;
    m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => b.inv - a.inv || a.name.localeCompare(b.name, "id"));
}

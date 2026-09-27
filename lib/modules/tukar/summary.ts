import type { AgingLine, Exchange } from "@/lib/local/datasets";
import { daysBetween } from "@/lib/parsers/date";

// Dashboard Tukar Faktur: per bulan invoice date — jumlah invoice, sudah tukar faktur, rata-rata hari
// (tanggal TF − invoice date). Urutan tetap: Mitra10, RKM, Modern Market, Proyek.
// Mitra10 & RKM memakai hitungan Kertas Kerja masing-masing (TF Done = SJ ada di file Kwitansi; sama dengan
// dashboard Mitra10/RKM). Modern Market & Proyek dari Master Aging terbaru + catatan tukar faktur
// (Daftar Tagihan › Tukar Faktur / Aplikasi Kolektor), di luar invoice Mitra10 & RKM agar tidak dihitung dua kali.

export type TfKey = "m10" | "rkm" | "mm" | "proyek";
export type TfStat = {
  key: TfKey; label: string; source: string;
  invoice: number; done: number; pending: number; pct: number | null; avgHari: number | null;
};
type KkRow = { invoice_date: string | null; tukar_faktur: "Done" | "Pending"; lama_tf: number | null };

const avg1 = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const low = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
/** "16-Modern Market National" → "modern market national". */
export const marketingName = (m: string | null | undefined) => low(m).replace(/^\d+\s*-\s*/, "");

const MM = new Set(["modern market", "modern market national"]);
const PROYEK = new Set(["proyek"]);

function stat(key: TfKey, label: string, source: string, rows: { done: boolean; hari: number | null }[]): TfStat {
  const done = rows.filter((r) => r.done).length;
  return {
    key, label, source, invoice: rows.length, done, pending: rows.length - done,
    pct: rows.length ? done / rows.length : null,
    avgHari: avg1(rows.filter((r) => r.done && r.hari !== null).map((r) => r.hari!)),
  };
}

const kkRows = (rows: KkRow[] | null, month: string) => (rows ?? [])
  .filter((r) => r.invoice_date?.slice(0, 7) === month)
  .map((r) => ({ done: r.tukar_faktur === "Done", hari: r.lama_tf }));

/** Invoice Modern Market / Proyek di aging (unik per invoice), tanpa invoice Mitra10 & RKM. */
function agingGroup(aging: AgingLine[], names: Set<string>, exclude: string[]) {
  const ex = new Set(exclude.map(low).filter(Boolean));
  const out = new Map<string, string | null>(); // invoice_no → invoice_date
  for (const a of aging) {
    if (!a.invoice_no || !names.has(marketingName(a.marketing)) || ex.has(low(a.tax_name))) continue;
    if (!out.has(a.invoice_no)) out.set(a.invoice_no, a.invoice_date);
  }
  return out;
}

export function tukarSummary(input: {
  month: string;
  m10: KkRow[] | null; rkm: KkRow[] | null;
  aging: AgingLine[]; exchanges: Exchange[];
  m10Tax: string; rkmTax: string;
}): TfStat[] {
  // Tanggal tukar faktur pertama per invoice.
  const tf = new Map<string, string>();
  for (const e of input.exchanges) {
    if (!e.tanggal) continue;
    const cur = tf.get(e.invoice_no);
    if (!cur || e.tanggal < cur) tf.set(e.invoice_no, e.tanggal);
  }
  const fromAging = (names: Set<string>) => [...agingGroup(input.aging, names, [input.m10Tax, input.rkmTax])]
    .filter(([, d]) => d?.slice(0, 7) === input.month)
    .map(([inv, d]) => {
      const t = tf.get(inv);
      return { done: !!t, hari: t && d ? daysBetween(t, d) : null };
    });

  return [
    stat("m10", "Mitra10", "Kertas Kerja Mitra10 · TF = SJ ada di file Kwitansi", kkRows(input.m10, input.month)),
    stat("rkm", "RKM", "Kertas Kerja RKM · TF = SJ ada di file Kwitansi RKM", kkRows(input.rkm, input.month)),
    stat("mm", "Modern Market", "Aging terbaru (Modern Market & National, di luar Mitra10/RKM) · catatan Tukar Faktur", fromAging(MM)),
    stat("proyek", "Proyek", "Aging terbaru (marketing Proyek) · catatan Tukar Faktur", fromAging(PROYEK)),
  ];
}

/** Bulan invoice date yang punya data di salah satu kelompok (terbaru dulu), selalu termasuk `current`. */
export function tukarMonths(input: { m10: KkRow[] | null; rkm: KkRow[] | null; aging: AgingLine[]; current: string }) {
  const s = new Set<string>([input.current]);
  for (const r of [...(input.m10 ?? []), ...(input.rkm ?? [])]) if (r.invoice_date) s.add(r.invoice_date.slice(0, 7));
  for (const a of input.aging) {
    const m = marketingName(a.marketing);
    if (a.invoice_date && (MM.has(m) || PROYEK.has(m))) s.add(a.invoice_date.slice(0, 7));
  }
  return [...s].sort().reverse();
}

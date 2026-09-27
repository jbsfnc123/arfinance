import type { AgingLine, Exchange } from "@/lib/local/datasets";
import { daysBetween } from "@/lib/parsers/date";
import { remarkKey } from "@/lib/modules/remarks";

// Dashboard Tukar Faktur: per bulan invoice date — jumlah invoice, sudah tukar faktur, rata-rata hari
// (tanggal TF − invoice date). Urutan tetap: Mitra10, RKM, Modern Market, Proyek.
// Mitra10 & RKM memakai hitungan Kertas Kerja masing-masing (TF Done = SJ ada di file Kwitansi; sama dengan
// dashboard Mitra10/RKM). Modern Market & Proyek dari Master Aging terbaru + catatan tukar faktur
// (Daftar Tagihan › Tukar Faktur / Aplikasi Kolektor), di luar invoice Mitra10 & RKM agar tidak dihitung dua kali.
// Setiap kelompok membawa baris rinciannya (satu baris = satu invoice/SJ yang dihitung).

export type TfKey = "m10" | "rkm" | "mm" | "proyek";
export type TfRow = {
  key: string; bp: string; invoice_no: string; no_sj: string | null; invoice_date: string | null; due_date: string | null;
  tf_date: string | null; status: "Sudah TF" | "Belum TF"; hari: number | null; nominal: number;
  keterangan: string | null; collection: string | null;
};
export type TfStat = {
  key: TfKey; label: string; source: string;
  invoice: number; done: number; pending: number; pct: number | null; avgHari: number | null;
  rows: TfRow[];
};
type KkRow = {
  invoice_date: string | null; tukar_faktur: "Done" | "Pending"; lama_tf: number | null; tf_date?: string | null;
  business_partner?: string | null; invoice_no?: string | null; no_sj?: string | null; due_date?: string | null;
  open_amt?: number; keterangan?: string | null;
};

const avg1 = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const low = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
/** "16-Modern Market National" → "modern market national". */
export const marketingName = (m: string | null | undefined) => low(m).replace(/^\d+\s*-\s*/, "");

const MM = new Set(["modern market", "modern market national"]);
const PROYEK = new Set(["proyek"]);

function stat(key: TfKey, label: string, source: string, rows: TfRow[]): TfStat {
  const done = rows.filter((r) => r.status === "Sudah TF").length;
  return {
    key, label, source, invoice: rows.length, done, pending: rows.length - done,
    pct: rows.length ? done / rows.length : null,
    avgHari: avg1(rows.filter((r) => r.status === "Sudah TF" && r.hari !== null).map((r) => r.hari!)),
    rows,
  };
}

const kkRows = (key: TfKey, rows: KkRow[] | null, month: string): TfRow[] => (rows ?? [])
  .filter((r) => r.invoice_date?.slice(0, 7) === month)
  .map((r, i) => {
    const done = r.tukar_faktur === "Done";
    return {
      key: `${key}:${r.no_sj ?? ""}:${r.invoice_no ?? ""}:${i}`, bp: r.business_partner ?? "", invoice_no: r.invoice_no ?? "",
      no_sj: r.no_sj ?? null, invoice_date: r.invoice_date, due_date: r.due_date ?? null,
      tf_date: done ? r.tf_date ?? null : null, status: done ? "Sudah TF" : "Belum TF", hari: done ? r.lama_tf : null,
      nominal: Number(r.open_amt) || 0, keterangan: r.keterangan ?? null, collection: null,
    };
  });

export function tukarSummary(input: {
  month: string;
  m10: KkRow[] | null; rkm: KkRow[] | null;
  aging: AgingLine[]; exchanges: Exchange[];
  m10Tax: string; rkmTax: string;
  remarks?: Map<string, string>;
}): TfStat[] {
  // Tanggal tukar faktur pertama per invoice.
  const tf = new Map<string, string>();
  for (const e of input.exchanges) {
    if (!e.tanggal) continue;
    const cur = tf.get(e.invoice_no);
    if (!cur || e.tanggal < cur) tf.set(e.invoice_no, e.tanggal);
  }
  const ex = new Set([input.m10Tax, input.rkmTax].map(low).filter(Boolean));

  // Modern Market / Proyek: satu baris per invoice di aging terbaru (nominal dijumlah per invoice).
  const fromAging = (key: TfKey, names: Set<string>): TfRow[] => {
    const byInv = new Map<string, TfRow>();
    for (const a of input.aging) {
      if (!a.invoice_no || !names.has(marketingName(a.marketing)) || ex.has(low(a.tax_name))) continue;
      if (a.invoice_date?.slice(0, 7) !== input.month) continue;
      const cur = byInv.get(a.invoice_no);
      if (cur) { cur.nominal += Number(a.open_amt) || 0; continue; }
      const t = tf.get(a.invoice_no) ?? null;
      byInv.set(a.invoice_no, {
        key: `${key}:${a.invoice_no}`, bp: a.business_partner ?? "", invoice_no: a.invoice_no, no_sj: a.no_sj,
        invoice_date: a.invoice_date, due_date: a.due_date, tf_date: t, status: t ? "Sudah TF" : "Belum TF",
        hari: t && a.invoice_date ? daysBetween(t, a.invoice_date) : null, nominal: Number(a.open_amt) || 0,
        keterangan: input.remarks?.get(remarkKey(a.no_sj, a.invoice_no)) || null, collection: a.collection_name,
      });
    }
    return [...byInv.values()];
  };

  return [
    stat("m10", "Mitra10", "Kertas Kerja Mitra10 · TF = SJ ada di file Kwitansi", kkRows("m10", input.m10, input.month)),
    stat("rkm", "RKM", "Kertas Kerja RKM · TF = SJ ada di file Kwitansi RKM", kkRows("rkm", input.rkm, input.month)),
    stat("mm", "Modern Market", "Aging terbaru (Modern Market & National, di luar Mitra10/RKM) · catatan Tukar Faktur", fromAging("mm", MM)),
    stat("proyek", "Proyek", "Aging terbaru (marketing Proyek) · catatan Tukar Faktur", fromAging("proyek", PROYEK)),
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

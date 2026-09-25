import { daysBetween } from "@/lib/parsers/date";
import { num } from "@/lib/local/pack";
import type { AgingLine, RkmGr, RkmKw, RkmWorksheet } from "@/lib/local/datasets";
import { remarkKey } from "@/lib/modules/remarks";
import { splitSj } from "@/lib/modules/collection/revision";

// RKM Tukar Faktur (Anyar Retail Indonesia), versi RKM dari rumus Mitra10 — dihitung di browser.
// Kunci pencocokan: No SJ (aging) = "No. Pengiriman" (file GR/Kwitansi RKM). No SJ gabungan
// "SJ/a-SJ/b" dipecah (splitSj): cukup salah satu SJ yang cocok.

export const RKM_TAX_DEFAULT = "Anyar Retail Indonesia";

// Toko RKM dari Business Partner: "Anyar Retail Indonesia - RKM Cibabat" → "RKM Cibabat".
export function cabangOf(bp: string | null | undefined) {
  const s = (bp ?? "").trim();
  if (!s) return "kosong";
  const i = s.lastIndexOf(" - ");
  return i >= 0 ? s.slice(i + 3).trim() || "kosong" : s;
}

export const rkmAgingLines = (lines: AgingLine[], taxName: string) => {
  const t = taxName.trim().toLowerCase();
  return lines.filter((l) => (l.tax_name ?? "").trim().toLowerCase() === t);
};

export type RkmRow = RkmWorksheet & {
  cabang: string; keterangan: string | null; gr: "Done" | "Pending"; tukar_faktur: "Done" | "Pending"; selisih: number;
  status: "Outstanding" | "Lunas"; jadwal_bayar: string | null; lama_tf: number | null; no_faktur_pajak: string | null;
};
export type RkmGrRow = RkmGr & { aging_open: number | null; check_status: "Done" | "Check" };
export type RkmKwRow = RkmKw & { aging: number; selisih_aging: number };

const up = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

export function computeRkm(input: { worksheet: RkmWorksheet[]; gr: RkmGr[]; kwitansi: RkmKw[]; aging: AgingLine[]; remarks?: Map<string, string> }) {
  // Aging: invoice → masih outstanding; SJ → open amt (dijumlah per SJ, baris SJ gabungan ikut ke tiap SJ-nya).
  const agingInv = new Set<string>();
  const agingSjOpen = new Map<string, number>();
  for (const a of input.aging) {
    if (a.invoice_no) agingInv.add(a.invoice_no);
    for (const sj of splitSj(a.no_sj)) agingSjOpen.set(sj, (agingSjOpen.get(sj) ?? 0) + num(a.open_amt));
  }

  const grSj = new Set(input.gr.map((g) => up(g.no_sj)).filter(Boolean));
  const kwBySj = new Map<string, RkmKw[]>();
  for (const k of [...input.kwitansi].sort((a, b) => a.id - b.id)) {
    const sj = up(k.no_sj);
    if (sj) (kwBySj.get(sj) ?? kwBySj.set(sj, []).get(sj)!).push(k);
  }

  const worksheet: RkmRow[] = input.worksheet.map((w) => {
    const sjs = splitSj(w.no_sj);
    const kws = sjs.flatMap((sj) => kwBySj.get(sj) ?? []);
    const paid = kws.reduce((s, k) => s + num(k.jumlah_faktur_pajak), 0);
    const inputDates = kws.map((k) => k.tanggal_input).filter((d): d is string => !!d).sort();
    const done = kws.length > 0;
    return {
      ...w,
      open_amt: num(w.open_amt),
      cabang: cabangOf(w.business_partner),
      keterangan: input.remarks?.get(remarkKey(w.no_sj, w.invoice_no)) || null,
      gr: done || sjs.some((sj) => grSj.has(sj)) ? "Done" : "Pending",
      tukar_faktur: done ? "Done" : "Pending",
      selisih: num(w.open_amt) - paid,
      status: w.invoice_no && agingInv.has(w.invoice_no) ? "Outstanding" : "Lunas",
      jadwal_bayar: null,
      lama_tf: inputDates[0] && w.invoice_date ? daysBetween(inputDates[0], w.invoice_date) : null,
      no_faktur_pajak: kws.map((k) => k.no_faktur_pajak).filter(Boolean).join(", ") || null,
    };
  });

  const wsSj = new Set(input.worksheet.flatMap((w) => splitSj(w.no_sj)));
  const gr: RkmGrRow[] = input.gr.map((g) => {
    const sj = up(g.no_sj);
    return { ...g, aging_open: agingSjOpen.get(sj) ?? null, check_status: sj && wsSj.has(sj) ? "Done" : "Check" };
  });

  const kwitansi: RkmKwRow[] = input.kwitansi.map((k) => {
    const ag = agingSjOpen.get(up(k.no_sj)) ?? 0;
    return { ...k, aging: ag, selisih_aging: num(k.jumlah_faktur_pajak) - ag };
  });

  return { worksheet, gr, kwitansi };
}

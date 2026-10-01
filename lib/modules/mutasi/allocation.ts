import { num } from "@/lib/local/pack";
import type { Datasets, Target } from "@/lib/local/datasets";

// "Ke mana uang masuk dialokasikan?" (Fase 50). Satu bulan M, dari data lokal yang sama dengan Dashboard Mutasi:
// - Penjualan     = Σ invoice ERP dengan invoice date di M ("Invoice Create").
// - Uang masuk    = Σ mutasi rekening di M tanpa yang dikecualikan manual ("Total Uang Masuk").
// - Target        = Σ target bulan M (invoice sebelum M).
// Pembayaran ERP ber-payment date di M ("Allocated") dibagi TANPA tumpang tindih, berurutan:
//   1. target (invoice ada di target M) = "Allocated in Target"
//   2. penjualan (invoice date di M, bukan target)
//   3. lainnya (invoice lain)
// Belum dialokasikan = uang masuk − total pembayaran (≥ 0). Bila pembayaran > uang masuk → `over` > 0 dan persen
// pos dihitung dari total pembayaran agar jumlahnya tetap 100%.

export type Allocation = {
  month: string;
  sales: number; inflow: number; target: number;
  allocTarget: number; allocSales: number; allocOther: number; allocTotal: number;
  unallocated: number; over: number;
  outstanding: number; targetLeft: number;
  base: number; // penyebut persen pos = max(uang masuk, total pembayaran)
};

export function allocationOf(input: {
  month: string; mutasi: Datasets["mutasi"]; erp: Datasets["erp"]; targets: Target[];
}): Allocation {
  const { month } = input;
  const inMonth = (d: string | null | undefined) => !!d && d.slice(0, 7) === month;
  const key = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

  const inflow = input.mutasi.mutations.reduce((s, m) => (inMonth(m.tx_date) && !m.excluded ? s + num(m.amount) : s), 0);
  const targetRows = input.targets.filter((t) => t.month === month);
  const target = targetRows.reduce((s, t) => s + num(t.target), 0);
  const targetInv = new Set(targetRows.map((t) => key(t.invoice_no)));
  const salesInv = new Set<string>();
  let sales = 0;
  for (const i of input.erp.invoices) {
    if (!inMonth(i.invoice_date)) continue;
    sales += num(i.amount);
    salesInv.add(key(i.invoice_no));
  }

  let allocTarget = 0, allocSales = 0, allocOther = 0;
  for (const p of input.erp.payments) {
    if (!inMonth(p.payment_date)) continue;
    const k = key(p.invoice_no), a = num(p.amount);
    if (targetInv.has(k)) allocTarget += a;
    else if (salesInv.has(k)) allocSales += a;
    else allocOther += a;
  }
  const allocTotal = allocTarget + allocSales + allocOther;
  return {
    month, sales, inflow, target, allocTarget, allocSales, allocOther, allocTotal,
    unallocated: Math.max(0, inflow - allocTotal), over: Math.max(0, allocTotal - inflow),
    outstanding: Math.max(0, sales - allocSales), targetLeft: Math.max(0, target - allocTarget),
    base: Math.max(inflow, allocTotal),
  };
}

/** Persen (0–100) aman terhadap pembagi nol. */
export const pctOf = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

/** Rupiah ringkas: 1,2 M · 350,5 jt · 12.500. */
export function rpShort(n: number) {
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  const f = (v: number) => v.toLocaleString("id-ID", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
  if (a >= 1e9) return `${s}${f(a / 1e9)} M`;
  if (a >= 1e6) return `${s}${f(a / 1e6)} jt`;
  return `${s}${Math.round(a).toLocaleString("id-ID")}`;
}

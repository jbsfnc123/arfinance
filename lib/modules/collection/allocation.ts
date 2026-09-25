import { num } from "@/lib/local/pack";
import type { AgingLine, Target } from "@/lib/local/datasets";

// Alokasi (pembayaran ERP) per hari untuk satu collection. Pembayaran hanya punya No Invoice,
// jadi collection dicari berurutan: target bulan itu → baris aging terkini → BP invoice ERP
// (collection terbanyak untuk BP tsb di aging).

type Payment = { invoice_no: string; payment_date: string; amount: number };
type ErpInvoice = { invoice_no: string; bp_key?: string | null };

// Peta invoice → collection (tanpa bulan; target bulan dipakai terpisah karena paling akurat).
export function collectionMap(agingAll: AgingLine[], invoices: ErpInvoice[]) {
  const byInvoice = new Map<string, string>();
  const bpCount = new Map<string, Map<string, number>>();
  for (const l of agingAll) {
    if (!l.collection_name) continue;
    if (l.invoice_no && !byInvoice.has(l.invoice_no)) byInvoice.set(l.invoice_no, l.collection_name);
    if (l.bp_key) {
      const m = bpCount.get(l.bp_key) ?? bpCount.set(l.bp_key, new Map()).get(l.bp_key)!;
      m.set(l.collection_name, (m.get(l.collection_name) ?? 0) + 1);
    }
  }
  const bpColl = new Map([...bpCount].map(([bp, m]) => [bp, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
  const invBp = new Map(invoices.map((i) => [i.invoice_no, i.bp_key ?? ""]));
  return (invoiceNo: string) => byInvoice.get(invoiceNo) ?? bpColl.get(invBp.get(invoiceNo) ?? "") ?? null;
}

export function collectionAllocation(input: {
  month: string; collection: string; payments: Payment[]; invoices: ErpInvoice[]; targets: Target[]; agingAll: AgingLine[];
}) {
  const monthTargets = input.targets.filter((t) => t.month === input.month);
  const targetColl = new Map(monthTargets.map((t) => [t.invoice_no, t.collection_name ?? ""]));
  const fallback = collectionMap(input.agingAll, input.invoices);
  const collOf = (inv: string) => targetColl.get(inv) || fallback(inv);

  const [y, m] = input.month.split("-").map(Number);
  const last = /^\d{4}-\d{2}$/.test(input.month) ? new Date(Date.UTC(y, m, 0)).getUTCDate() : 0;
  const days = Array.from({ length: last }, (_, i) => ({ date: `${input.month}-${String(i + 1).padStart(2, "0")}`, inTarget: 0, outside: 0 }));
  let unmapped = 0, unmappedCount = 0;
  const months = new Set<string>();
  for (const p of input.payments) {
    const pm = p.payment_date?.slice(0, 7);
    const c = collOf(p.invoice_no);
    if (pm && c === input.collection) months.add(pm);
    if (pm !== input.month) continue;
    if (!c) { unmapped += num(p.amount); unmappedCount++; continue; }
    if (c !== input.collection) continue;
    const d = days[Number(p.payment_date.slice(8, 10)) - 1];
    if (targetColl.has(p.invoice_no)) d.inTarget += num(p.amount); else d.outside += num(p.amount);
  }
  const inTarget = days.reduce((a, d) => a + d.inTarget, 0);
  const outside = days.reduce((a, d) => a + d.outside, 0);
  const active = days.filter((d) => d.inTarget + d.outside !== 0).length;
  const target = monthTargets.filter((t) => t.collection_name === input.collection).reduce((a, t) => a + num(t.target), 0);
  return {
    days, inTarget, outside, total: inTarget + outside, avgPerActiveDay: active ? (inTarget + outside) / active : 0,
    target, pctTarget: target ? inTarget / target : 0, unmapped, unmappedCount,
    months: [...months].sort().reverse(),
  };
}

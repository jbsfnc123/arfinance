import { num } from "@/lib/local/pack";
import type { Datasets, Target } from "@/lib/local/datasets";
import type { MutasiRaw } from "./dashboard";

// Port RPC mutasi_dashboard ke browser: uang masuk per rekening per hari (tanpa transaksi yang
// dikecualikan manual), Allocated & Allocated in Target dari payment ERP, Invoice Create.

const monthDays = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
};

export function mutasiRaw(input: {
  month: string; today: string; mutasi: Datasets["mutasi"]; erp: Datasets["erp"]; targets: Target[];
}): MutasiRaw {
  const { month } = input;
  const inMonth = (d: string | null | undefined) => !!d && d.slice(0, 7) === month;
  const muts = input.mutasi.mutations.filter((m) => inMonth(m.tx_date));
  const target = input.targets.filter((t) => t.month === month);
  const targetInv = new Set(target.map((t) => t.invoice_no));

  const withData = new Set(muts.map((m) => m.account));
  const accounts = [...input.mutasi.accounts]
    .filter((a) => a.active || withData.has(a.code))
    .sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code))
    .map((a) => a.code);

  type Day = MutasiRaw["days"][number];
  const byDate = new Map<string, Day>(monthDays(month).map((date) => [date, { date, mut: {}, alloc: 0, allocT: 0, inv: 0, exc: 0, excN: 0 }]));
  for (const m of muts) {
    const d = byDate.get(m.tx_date)!;
    if (m.excluded) { d.exc! += num(m.amount); d.excN! += 1; }
    else d.mut[m.account] = (d.mut[m.account] ?? 0) + num(m.amount);
  }
  for (const p of input.erp.payments) {
    if (!inMonth(p.payment_date)) continue;
    const d = byDate.get(p.payment_date)!;
    d.alloc += num(p.amount);
    if (targetInv.has(p.invoice_no)) d.allocT += num(p.amount);
  }
  for (const i of input.erp.invoices) if (inMonth(i.invoice_date)) byDate.get(i.invoice_date)!.inv += num(i.amount);

  const months = new Set<string>([input.today.slice(0, 7)]);
  for (const m of input.mutasi.mutations) months.add(m.tx_date.slice(0, 7));
  for (const i of input.erp.invoices) if (i.invoice_date) months.add(i.invoice_date.slice(0, 7));
  for (const p of input.erp.payments) if (p.payment_date) months.add(p.payment_date.slice(0, 7));
  for (const t of input.targets) months.add(t.month);

  return {
    accounts,
    target: target.reduce((s, t) => s + num(t.target), 0),
    targetCount: target.length,
    days: [...byDate.values()],
    months: [...months].sort().reverse(),
  };
}

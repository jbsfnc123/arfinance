import { num } from "@/lib/local/pack";
import type { AgingLine, Target } from "@/lib/local/datasets";

// Rekonsiliasi "Terkumpul" (target − sisa aging) vs "Allocated in Target" (pembayaran ERP bulan
// target untuk invoice target) per invoice, lalu setiap selisih diberi kemungkinan penyebab.

export type ReconCategory = "cm" | "ppn" | "hilang" | "luar_bulan" | "potongan" | "turun" | "lebih";
export const RECON_LABEL: Record<ReconCategory, string> = {
  cm: "Retur / Credit Memo dikompensasikan ke invoice lain",
  ppn: "PPN 11% tidak dibayar (dipungut/WAPU atau CN PPN)",
  hilang: "Hilang dari aging tanpa pembayaran (retur / pembatalan?)",
  luar_bulan: "Pembayaran tercatat di luar bulan target",
  potongan: "Potongan kecil / biaya transfer",
  turun: "Open turun tanpa pembayaran cukup (retur / CN?)",
  lebih: "Pembayaran melebihi turunnya open",
};

export type ReconRow = {
  invoice_no: string; business_partner: string; target: number; sisa: number; inAging: boolean;
  terkumpul: number; dibayar: number; dibayarLain: number; selisih: number; category: ReconCategory;
};

export function reconcileCollected(input: {
  month: string; targets: Target[]; agingAll: AgingLine[];
  payments: { invoice_no: string; payment_date: string; amount: number }[];
}) {
  // Sisa per invoice dari snapshot aging terkini TANPA filter Collection (invoice ganda → baris pertama).
  const sisa = new Map<string, number>();
  for (const l of [...input.agingAll].sort((a, b) => a.line_no - b.line_no)) {
    if (l.invoice_no && !sisa.has(l.invoice_no)) sisa.set(l.invoice_no, num(l.open_amt));
  }
  const inMonth = new Map<string, number>(), other = new Map<string, number>();
  for (const p of input.payments) {
    const m = p.payment_date?.slice(0, 7) === input.month ? inMonth : other;
    m.set(p.invoice_no, (m.get(p.invoice_no) ?? 0) + num(p.amount));
  }

  const all = input.targets.filter((t) => t.month === input.month).map((t) => {
    const target = num(t.target);
    const s = sisa.get(t.invoice_no) ?? 0;
    const terkumpul = target - s;
    const dibayar = inMonth.get(t.invoice_no) ?? 0;
    return {
      invoice_no: t.invoice_no, business_partner: t.business_partner ?? "", target, sisa: s, inAging: sisa.has(t.invoice_no),
      terkumpul, dibayar, dibayarLain: other.get(t.invoice_no) ?? 0, selisih: terkumpul - dibayar, category: "turun" as ReconCategory,
    };
  });
  const rows = all.filter((r) => Math.abs(r.selisih) >= 1);

  // 1. Credit Memo: CM (target negatif / nomor CM/) dipasangkan dengan invoice yang kurang bayar sebesar nilai CM.
  const used = new Set<ReconRow>();
  for (const cm of rows.filter((r) => r.target < 0 || /^CM\//i.test(r.invoice_no))) {
    const pair = rows.find((r) => !used.has(r) && r !== cm && r.target > 0 && Math.abs(r.selisih + cm.selisih) < 1);
    used.add(cm); cm.category = "cm";
    if (pair) { used.add(pair); pair.category = "cm"; }
  }
  for (const r of rows) {
    if (used.has(r)) continue;
    const ppn = r.target - r.target / 1.11;
    r.category =
      r.target > 0 && Math.abs(r.selisih - ppn) <= 2 ? "ppn"
      : !r.inAging && r.dibayar === 0 && r.dibayarLain === 0 ? "hilang"
      : r.dibayar === 0 && r.dibayarLain > 0 ? "luar_bulan"
      : Math.abs(r.selisih) <= Math.max(100000, Math.abs(r.target) * 0.01) ? "potongan"
      : r.selisih > 0 ? "turun" : "lebih";
  }

  const sum = (xs: ReconRow[], k: "terkumpul" | "dibayar" | "selisih") => xs.reduce((a, r) => a + r[k], 0);
  const categories = (Object.keys(RECON_LABEL) as ReconCategory[])
    .map((c) => { const rs = rows.filter((r) => r.category === c); return { category: c, label: RECON_LABEL[c], count: rs.length, selisih: sum(rs, "selisih"), rows: rs }; })
    .filter((c) => c.count > 0);
  return { terkumpul: sum(all, "terkumpul"), allocT: sum(all, "dibayar"), selisih: sum(all, "selisih"), categories };
}

// Grafik Alokasi Target: per tanggal bulan target — Allocated in Target harian & kumulatif,
// kumulatif seluruh pembayaran (Allocated), berhenti di hari ini (sama dengan Mutasi vs Realisasi).
export function allocationSeries(input: {
  month: string; today: string; targets: Target[]; payments: { invoice_no: string; payment_date: string; amount: number }[];
}) {
  const monthTargets = input.targets.filter((t) => t.month === input.month);
  const inTarget = new Set(monthTargets.map((t) => t.invoice_no));
  const target = monthTargets.reduce((a, t) => a + num(t.target), 0);
  const [y, m] = input.month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dayAllocT = new Array<number>(last).fill(0), dayAlloc = new Array<number>(last).fill(0);
  for (const p of input.payments) {
    if (p.payment_date?.slice(0, 7) !== input.month) continue;
    const i = Number(p.payment_date.slice(8, 10)) - 1;
    dayAlloc[i] += num(p.amount);
    if (inTarget.has(p.invoice_no)) dayAllocT[i] += num(p.amount);
  }
  let cT = 0, cA = 0;
  const days = dayAllocT.map((v, i) => {
    const date = `${input.month}-${String(i + 1).padStart(2, "0")}`;
    cT += v; cA += dayAlloc[i];
    const future = date > input.today;
    return { date, allocT: v, alloc: dayAlloc[i], cumAllocT: future ? null : cT, cumAlloc: future ? null : cA };
  });
  return { target, days, totalAllocT: cT, totalAlloc: cA };
}

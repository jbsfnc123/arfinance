import type { AgingLine, Datasets } from "@/lib/local/datasets";
import { daysBetween } from "@/lib/parsers/date";

// History Pembayaran BP (Collection): pembayaran 3 bulan penuh terakhir berdasarkan payment date, hanya invoice
// ber-tempo ("Net N Days", termasuk "With Tolerance Days"). CBD/Immediate diabaikan — tidak dihitung, tidak disimpan.
// Lama pembayaran = payment date − due date (negatif = dibayar sebelum jatuh tempo). Sisa outstanding & overdue
// dari Master Aging terbaru (sama dengan Daftar Tagihan).

export type HistoryTx = {
  invoice_no: string; invoice_date: string | null; due_date: string; payment_date: string;
  amount: number; lama: number; term: string;
};
export type HistoryRow = {
  key: string; bp: string; payment_group: string; collection: string; term: string;
  count: number; paid: number; avgLama: number; maxLama: number;
  top3: HistoryTx[]; top3Text: string; outstanding: number; overdue: number;
  tx: HistoryTx[];
};
export type Period = { from: string; to: string; months: string[] };

export const hasTempo = (term: string | null | undefined) => /^\s*net\s+\d+\s+days?/i.test(term ?? "");

const ym = (y: number, m: number) => new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);

/** 3 bulan kalender penuh sebelum bulan `today` (bulan berjalan tidak ikut). Sep 2026 → Jun–Agu 2026. */
export function historyPeriod(today: string): Period {
  const [y, m] = today.split("-").map(Number); // m = 1..12
  const months = [ym(y, m - 4), ym(y, m - 3), ym(y, m - 2)];
  const [ly, lm] = months[2].split("-").map(Number);
  const last = new Date(Date.UTC(ly, lm, 0)).toISOString().slice(0, 10);
  return { from: `${months[0]}-01`, to: last, months };
}

/** Jumlah transaksi pembayaran per bulan periode (semua term) — untuk peringatan data yang belum di-upload. */
export function coverage(erp: Datasets["erp"], period: Period) {
  const n = Object.fromEntries(period.months.map((m) => [m, 0]));
  for (const p of erp.payments) { const k = p.payment_date?.slice(0, 7); if (k && k in n) n[k]++; }
  return period.months.map((m) => ({ month: m, payments: n[m] }));
}

const fmtTop = (t: HistoryTx) => `${t.invoice_no} ${t.lama > 0 ? "+" : ""}${t.lama} hr`;

export function paymentHistory(erp: Datasets["erp"], aging: AgingLine[], period: Period, today: string): HistoryRow[] {
  const inv = new Map(erp.invoices.map((i) => [i.invoice_no, i]));

  // Aging terbaru per BP: nama, grup, collection, sisa & overdue.
  const ag = new Map<string, { bp: string; pg: string; coll: string; out: number; over: number }>();
  for (const l of aging) {
    if (!l.bp_key) continue;
    const a = ag.get(l.bp_key) ?? { bp: l.business_partner ?? "", pg: l.payment_group ?? "", coll: l.collection_name ?? "", out: 0, over: 0 };
    const amt = Number(l.open_amt) || 0;
    a.out += amt;
    if (l.due_date && l.due_date < today) a.over += amt;
    ag.set(l.bp_key, a);
  }

  const groups = new Map<string, { name: string; tx: HistoryTx[]; terms: Map<string, number> }>();
  for (const p of erp.payments) {
    if (!p.payment_date || p.payment_date < period.from || p.payment_date > period.to) continue;
    const i = inv.get(p.invoice_no);
    if (!i || !i.due_date || !hasTempo(i.payment_term)) continue; // tanpa tempo / tanpa due date: diabaikan
    const key = i.bp_key || `${i.bp_name ?? ""}|${i.bp_location ?? ""}`;
    const g = groups.get(key) ?? { name: [i.bp_name, i.bp_location].filter(Boolean).join(" - "), tx: [] as HistoryTx[], terms: new Map<string, number>() };
    const term = i.payment_term!.trim();
    g.tx.push({
      invoice_no: p.invoice_no, invoice_date: i.invoice_date ?? null, due_date: i.due_date, payment_date: p.payment_date,
      amount: Number(p.amount) || 0, lama: daysBetween(p.payment_date, i.due_date), term,
    });
    g.terms.set(term, (g.terms.get(term) ?? 0) + 1);
    groups.set(key, g);
  }

  const rows: HistoryRow[] = [];
  for (const [key, g] of groups) {
    const tx = g.tx.sort((a, b) => b.lama - a.lama || b.amount - a.amount || a.invoice_no.localeCompare(b.invoice_no));
    const paid = tx.reduce((s, t) => s + t.amount, 0);
    const w = tx.reduce((s, t) => s + Math.max(t.amount, 0), 0);
    const avgLama = w > 0 ? tx.reduce((s, t) => s + t.lama * Math.max(t.amount, 0), 0) / w : tx.reduce((s, t) => s + t.lama, 0) / tx.length;
    const a = ag.get(key);
    const top3 = tx.slice(0, 3);
    rows.push({
      key, bp: a?.bp || g.name || key, payment_group: a?.pg ?? "", collection: a?.coll ?? "",
      term: [...g.terms].sort((x, y) => y[1] - x[1])[0][0],
      count: tx.length, paid, avgLama: Math.round(avgLama * 10) / 10, maxLama: tx[0].lama,
      top3, top3Text: top3.map(fmtTop).join(" · "),
      outstanding: a?.out ?? 0, overdue: a?.over ?? 0, tx,
    });
  }
  return rows.sort((x, y) => y.maxLama - x.maxLama || y.overdue - x.overdue);
}

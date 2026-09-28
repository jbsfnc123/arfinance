import type { AgingLine, Datasets } from "@/lib/local/datasets";
import { daysBetween } from "@/lib/parsers/date";

// History Pembayaran BP (Collection): pembayaran 3 bulan penuh terakhir berdasarkan payment date, hanya invoice
// ber-tempo ("Net N Days", termasuk "With Tolerance Days"). CBD/Immediate diabaikan — tidak dihitung, tidak disimpan.
// Lama pembayaran = payment date − due date (negatif = dibayar sebelum jatuh tempo). Sisa outstanding & overdue
// dari Master Aging terbaru (sama dengan Daftar Tagihan). Marketplace (TikTok/Shopee) diabaikan seluruhnya.
// Mode Group: BP ber-payment group digabung per group; BP yang payment group-nya = nama marketing (Proyek,
// Traditional, …) tidak punya group dan tetap dihitung per BP.

export type HistoryTx = {
  invoice_no: string; invoice_date: string | null; due_date: string; payment_date: string;
  amount: number; lama: number; term: string; bp: string;
};
export type MonthStat = { month: string; count: number; paid: number; avgLama: number | null };
export type HistoryRow = {
  key: string; jenis: "BP" | "Group"; name: string; bpCount: number;
  group: string | null; payment_group: string; marketing: string; collection: string; term: string;
  count: number; paid: number; avgLama: number; maxLama: number;
  top3: HistoryTx[]; top3Text: string; outstanding: number; overdue: number;
  tx: HistoryTx[]; months: MonthStat[]; members: HistoryRow[];
  hasOld: boolean; // ada transaksi telat > OLD_DAYS (mis. piutang lama yang di-clear) → tidak ikut 20 teratas
};
export type Period = { from: string; to: string; months: string[] };

/** Batas telat (hari) — transaksi di atas ini membuat BP/Group dikeluarkan dari daftar default 20 teratas. */
export const OLD_DAYS = 365;

export const hasTempo = (term: string | null | undefined) => /^\s*net\s+\d+\s+days?/i.test(term ?? "");

const norm = (s: string | null | undefined) => (s ?? "").replace(/^\s*\d+\s*-\s*/, "").trim().toLowerCase();

/** Nama group, atau null bila payment group kosong / sama dengan nama marketing tanpa prefix angka ("04-Proyek" ↔ "Proyek"). */
export function groupOf(pg: string | null | undefined, marketing: string | null | undefined): string | null {
  const p = (pg ?? "").trim();
  if (!p || norm(p) === norm(marketing)) return null;
  return p;
}

/** Pembeli marketplace (TikTok/Shopee) — diabaikan di History Pembayaran. */
export function isMarketplace(pg: string | null | undefined, ...ids: (string | null | undefined)[]) {
  return /^(tiktok|shopee)$/i.test((pg ?? "").trim()) || ids.some((x) => /^(tiktok|shopee)\b/i.test((x ?? "").trim()));
}

const ym = (y: number, m: number) => new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);

/** 3 bulan kalender penuh sebelum bulan `today` (bulan berjalan tidak ikut). Sep 2026 → Jun–Agu 2026. */
export function historyPeriod(today: string): Period {
  const [y, m] = today.split("-").map(Number); // m = 1..12
  const months = [ym(y, m - 4), ym(y, m - 3), ym(y, m - 2)];
  const [ly, lm] = months[2].split("-").map(Number);
  const last = new Date(Date.UTC(ly, lm, 0)).toISOString().slice(0, 10);
  return { from: `${months[0]}-01`, to: last, months };
}

/** Jumlah transaksi pembayaran per bulan periode (semua term) — untuk peringatan data yang belum di-upload.
 *  Paket History (pack_erp_recent) hanya berisi pembayaran invoice ber-tempo, jadi hitungannya dikirim server (`counts`). */
export function coverage(erp: Datasets["erp"] & { counts?: Record<string, number> }, period: Period) {
  if (erp.counts) return period.months.map((m) => ({ month: m, payments: erp.counts![m] ?? 0 }));
  const n = Object.fromEntries(period.months.map((m) => [m, 0]));
  for (const p of erp.payments) { const k = p.payment_date?.slice(0, 7); if (k && k in n) n[k]++; }
  return period.months.map((m) => ({ month: m, payments: n[m] }));
}

const fmtTop = (t: HistoryTx) => `${t.invoice_no} ${t.lama > 0 ? "+" : ""}${t.lama} hr`;
const byLama = (a: HistoryTx, b: HistoryTx) => b.lama - a.lama || b.amount - a.amount || a.invoice_no.localeCompare(b.invoice_no);

/** Rata-rata lama bayar tertimbang nominal (fallback rata-rata biasa bila nominal nol). */
function avgOf(tx: HistoryTx[]) {
  if (!tx.length) return null;
  const w = tx.reduce((s, t) => s + Math.max(t.amount, 0), 0);
  const v = w > 0 ? tx.reduce((s, t) => s + t.lama * Math.max(t.amount, 0), 0) / w : tx.reduce((s, t) => s + t.lama, 0) / tx.length;
  return Math.round(v * 10) / 10;
}
const monthsOf = (tx: HistoryTx[], months: string[]): MonthStat[] => months.map((m) => {
  const t = tx.filter((x) => x.payment_date.startsWith(m));
  return { month: m, count: t.length, paid: t.reduce((s, x) => s + x.amount, 0), avgLama: avgOf(t) };
});
const topTerm = (tx: HistoryTx[]) => {
  const c = new Map<string, number>();
  for (const t of tx) c.set(t.term, (c.get(t.term) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
};

type AgingBp = { bp: string; pg: string; mk: string; coll: string; out: number; over: number; group: string | null };

/** Aging terbaru per bp_key (nama, group, collection, sisa, overdue). */
export function agingByBp(aging: AgingLine[], today: string) {
  const ag = new Map<string, AgingBp>();
  for (const l of aging) {
    if (!l.bp_key) continue;
    const a = ag.get(l.bp_key) ?? {
      bp: l.business_partner ?? "", pg: l.payment_group ?? "", mk: l.marketing ?? "", coll: l.collection_name ?? "",
      out: 0, over: 0, group: groupOf(l.payment_group, l.marketing),
    };
    const amt = Number(l.open_amt) || 0;
    a.out += amt;
    if (l.due_date && l.due_date < today) a.over += amt;
    ag.set(l.bp_key, a);
  }
  return ag;
}

function build(key: string, jenis: "BP" | "Group", name: string, tx: HistoryTx[], period: Period, extra: Partial<HistoryRow>): HistoryRow {
  const sorted = [...tx].sort(byLama);
  const top3 = sorted.slice(0, 3);
  return {
    key, jenis, name, bpCount: 1, group: null, payment_group: "", marketing: "", collection: "", term: topTerm(sorted),
    count: sorted.length, paid: sorted.reduce((s, t) => s + t.amount, 0), avgLama: avgOf(sorted) ?? 0, maxLama: sorted[0]?.lama ?? 0,
    top3, top3Text: top3.map(fmtTop).join(" · "), outstanding: 0, overdue: 0, tx: sorted, months: monthsOf(sorted, period.months), members: [], hasOld: sorted.some((t) => t.lama > OLD_DAYS),
    ...extra,
  };
}

/** Baris per BP (mode BP). */
export function paymentHistory(erp: Datasets["erp"], aging: AgingLine[], period: Period, today: string): HistoryRow[] {
  const inv = new Map(erp.invoices.map((i) => [i.invoice_no, i]));
  const ag = agingByBp(aging, today);

  const byBp = new Map<string, { name: string; tx: HistoryTx[] }>();
  for (const p of erp.payments) {
    if (!p.payment_date || p.payment_date < period.from || p.payment_date > period.to) continue;
    const i = inv.get(p.invoice_no);
    if (!i || !i.due_date || !hasTempo(i.payment_term)) continue; // tanpa tempo / tanpa due date: diabaikan
    const key = i.bp_key || `${i.bp_name ?? ""}|${i.bp_location ?? ""}`;
    const a = ag.get(key);
    if (isMarketplace(a?.pg, key, i.bp_name)) continue;
    const g = byBp.get(key) ?? { name: a?.bp || [i.bp_name, i.bp_location].filter(Boolean).join(" - ") || key, tx: [] };
    g.tx.push({
      invoice_no: p.invoice_no, invoice_date: i.invoice_date ?? null, due_date: i.due_date, payment_date: p.payment_date,
      amount: Number(p.amount) || 0, lama: daysBetween(p.payment_date, i.due_date), term: i.payment_term!.trim(), bp: g.name,
    });
    byBp.set(key, g);
  }

  return [...byBp].map(([key, g]) => {
    const a = ag.get(key);
    return build(key, "BP", g.name, g.tx, period, {
      group: a?.group ?? null, payment_group: a?.pg ?? "", marketing: a?.mk ?? "", collection: a?.coll ?? "",
      outstanding: a?.out ?? 0, overdue: a?.over ?? 0,
    });
  }).sort((x, y) => y.avgLama - x.avgLama || y.maxLama - x.maxLama);
}

/**
 * Baris mode Group: BP ber-group digabung per payment group (outstanding & overdue = seluruh BP group di aging,
 * termasuk yang tidak ada pembayaran di periode); BP tanpa group tetap sebagai baris BP.
 */
export function groupHistory(bpRows: HistoryRow[], aging: AgingLine[], period: Period, today: string): HistoryRow[] {
  const ag = agingByBp(aging, today);
  const totals = new Map<string, { out: number; over: number; bps: number; colls: Set<string> }>();
  for (const a of ag.values()) {
    if (!a.group || isMarketplace(a.pg)) continue;
    const t = totals.get(a.group) ?? { out: 0, over: 0, bps: 0, colls: new Set<string>() };
    t.out += a.out; t.over += a.over; t.bps++; if (a.coll) t.colls.add(a.coll);
    totals.set(a.group, t);
  }
  const members = new Map<string, HistoryRow[]>();
  const out: HistoryRow[] = [];
  for (const r of bpRows) {
    if (r.group) members.set(r.group, [...(members.get(r.group) ?? []), r]);
    else out.push(r);
  }
  for (const [group, rows] of members) {
    const t = totals.get(group);
    const colls = new Set([...(t?.colls ?? []), ...rows.map((r) => r.collection).filter(Boolean)]);
    out.push(build(`G:${group}`, "Group", group, rows.flatMap((r) => r.tx), period, {
      bpCount: rows.length, group, payment_group: group, marketing: rows[0].marketing, collection: [...colls].sort().join(", "),
      outstanding: t?.out ?? rows.reduce((s, r) => s + r.outstanding, 0), overdue: t?.over ?? rows.reduce((s, r) => s + r.overdue, 0),
      members: [...rows].sort((x, y) => y.avgLama - x.avgLama),
    }));
  }
  return out.sort((x, y) => y.avgLama - x.avgLama || y.maxLama - x.maxLama);
}

/** Dari nama BP (Daftar Tagihan) → bp_key & group di aging terbaru. */
export function findTarget(bpName: string, aging: AgingLine[]) {
  const l = aging.find((x) => x.business_partner === bpName && x.bp_key);
  if (!l) return null;
  return { bpKey: l.bp_key!, bp: bpName, group: groupOf(l.payment_group, l.marketing), marketplace: isMarketplace(l.payment_group, l.bp_key, bpName) };
}

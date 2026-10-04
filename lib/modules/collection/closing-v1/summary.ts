// Frozen evaluator for closing schemaVersion 1. Do not change historical arithmetic.
import { daysBetween } from "@/lib/parsers/date";
import { num } from "@/lib/local/pack";
import type { AgingLine, Note, Promise_, Target } from "@/lib/local/datasets";
import type { ArInvoice } from "../rows";
import type { ForecastRow, GroupRow, OverdueRow, SpvSummary } from "../spv-summary";
import { revisionLookup } from "./revision";
function latestBy<T extends { id: number; invoice_no: string }>(rows: T[]) {
 const m = new Map<string,T>(); for (const r of rows) { const p=m.get(r.invoice_no); if (!p || r.id>p.id) m.set(r.invoice_no,r); } return m;
}
// ── Dashboard Controller (port get_spv_summary) ────────────────
const pctOf = (target: number, sisa: number) => (target > 0 ? Math.round((Math.max(0, target - sisa) / target) * 1000) / 10 : 0);
const nz = (s: string | null | undefined, d: string) => (s ?? "").trim() || d;

export function computeSpvSummary(input: {
  month: string; today: string; targets: Target[]; ar: ArInvoice[]; promises: Promise_[]; notes: Note[]; lastTagihanUpdate: string | null;
  // Seluruh baris aging snapshot terkini (tanpa filter Collection). Invoice target yang masih open
  // tetapi tersaring filter Collection (mis. marketing lain) tidak boleh dianggap terkumpul.
  agingAll?: AgingLine[];
}): SpvSummary {
  const ar = new Map(input.ar.map((a) => [a.invoice_no, a]));
  const openAll = new Map<string, { open: number; due: string | null }>();
  for (const l of [...(input.agingAll ?? [])].sort((a, b) => a.line_no - b.line_no)) {
    if (l.invoice_no && !openAll.has(l.invoice_no)) openAll.set(l.invoice_no, { open: num(l.open_amt), due: l.due_date });
  }
  const jb = latestBy(input.promises);
  const monthTargets = input.targets.filter((t) => t.month === input.month);
  const revised = revisionLookup(input.agingAll ?? [], new Set(monthTargets.map((t) => t.invoice_no)));
  const r2 = monthTargets.map((t) => {
    const a = ar.get(t.invoice_no);
    const o = openAll.get(t.invoice_no);
    // Invoice direvisi (SJ sama, No Invoice baru) → sisa = open invoice pengganti, bukan terkumpul.
    const rev = !a && !o ? revised(t.invoice_no, t.no_sj) : null;
    const sisa = a ? a.open_amt : o ? o.open : rev ? rev.open : 0;
    const due = t.due_date ?? a?.due_date ?? o?.due ?? rev?.due ?? null;
    const days = due ? daysBetween(input.today, due) : null;
    const promise = jb.get(t.invoice_no)?.promise_date ?? null;
    return {
      invoice_no: t.invoice_no, mkt: nz(t.marketing, "Tanpa Marketing"), coll: nz(t.collection_name, "Tanpa Collection"),
      bp: nz(t.business_partner, "Tanpa Partner"), branch: nz(t.branch, "Tanpa Branch"), target: num(t.target), sisa,
      jb: promise, lunas: sisa <= 1000, days, openJanji: sisa > 1000 && promise !== null,
      aging: days === null ? "-" : days <= 0 ? "Belum Jatuh Tempo" : days <= 30 ? "1-30 Hari" : days <= 60 ? "31-60 Hari" : ">60 Hari",
    };
  });
  type R = (typeof r2)[number];

  const group = (key: (r: R) => string): GroupRow[] => {
    const m = new Map<string, R[]>();
    for (const r of r2) (m.get(key(r)) ?? m.set(key(r), []).get(key(r))!).push(r);
    return [...m.entries()].map(([nama, rs]) => {
      const target = rs.reduce((s, r) => s + r.target, 0), sisa = rs.reduce((s, r) => s + r.sisa, 0);
      const janji = rs.filter((r) => r.openJanji);
      return {
        nama, target, sisa, terkumpul: Math.max(0, target - sisa), pencapaian: pctOf(target, sisa),
        invTotal: rs.length, invLunas: rs.filter((r) => r.lunas).length, invBelum: rs.filter((r) => !r.lunas).length,
        janjiNom: janji.reduce((s, r) => s + r.sisa, 0), janjiCount: janji.length,
      };
    }).sort((a, b) => b.sisa - a.sisa || a.nama.localeCompare(b.nama));
  };

  const target = r2.reduce((s, r) => s + r.target, 0), sisa = r2.reduce((s, r) => s + r.sisa, 0);
  const belum = r2.filter((r) => !r.lunas);
  const janji = r2.filter((r) => r.openJanji);

  const agData: SpvSummary["agData"] = {};
  for (const k of ["Belum Jatuh Tempo", "1-30 Hari", "31-60 Hari", ">60 Hari"]) {
    const rs = belum.filter((r) => r.aging === k);
    agData[k] = { count: rs.length, nominal: rs.reduce((s, r) => s + r.sisa, 0) };
  }

  const caseInv = new Set(input.notes.filter((n) => n.kategori === "Case").map((n) => n.invoice_no));
  const caseNom = r2.filter((r) => caseInv.has(r.invoice_no)).reduce((s, r) => s + r.sisa, 0);

  // Top BP jatuh tempo terlama (hanya yang belum lunas).
  const byBp = new Map<string, R[]>();
  for (const r of belum) (byBp.get(r.bp) ?? byBp.set(r.bp, []).get(r.bp)!).push(r);
  const overdue: OverdueRow[] = [...byBp.entries()].map(([bp, rs]) => {
    const ds = rs.map((r) => r.days).filter((d): d is number => d !== null);
    const first = [...rs].sort((a, b) => (a.invoice_no < b.invoice_no ? -1 : 1))[0];
    return { bp, count: rs.length, maxDays: ds.length ? Math.max(...ds) : null, total: rs.reduce((s, r) => s + r.sisa, 0), marketing: first.mkt };
  });
  const rankCmp = (a: OverdueRow, b: OverdueRow) =>
    (a.maxDays === null ? 1 : 0) - (b.maxDays === null ? 1 : 0) || (b.maxDays ?? 0) - (a.maxDays ?? 0) || a.bp.localeCompare(b.bp);
  const sorted = [...overdue].sort(rankCmp);
  const byMkt: Record<string, OverdueRow[]> = {};
  for (const o of sorted) { const l = (byMkt[o.marketing] ??= []); if (l.length < 10) l.push(o); }

  const fc = new Map<string, R[]>();
  for (const r of janji) { const k = `${r.jb}|${r.mkt}`; (fc.get(k) ?? fc.set(k, []).get(k)!).push(r); }
  const forecastByDate: ForecastRow[] = [...fc.values()].map((rs) => {
    const bps = new Map<string, { bp: string; nom: number; count: number }>();
    for (const r of rs) { const b = bps.get(r.bp) ?? { bp: r.bp, nom: 0, count: 0 }; b.nom += r.sisa; b.count++; bps.set(r.bp, b); }
    return { date: rs[0].jb!, market: rs[0].mkt, nom: rs.reduce((s, r) => s + r.sisa, 0), count: rs.length,
      bps: [...bps.values()].sort((a, b) => b.nom - a.nom || a.bp.localeCompare(b.bp)) };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.market.localeCompare(b.market));

  return {
    month: input.month, target, sisa, terkumpul: Math.max(0, target - sisa), pencapaian: pctOf(target, sisa),
    forecast: janji.reduce((s, r) => s + r.sisa, 0), forecastCount: janji.length,
    invTotal: r2.length, invLunas: r2.length - belum.length, invBelum: belum.length,
    totalNominal: belum.reduce((s, r) => s + r.sisa, 0), totalInv: belum.length,
    agData, caseData: { count: caseInv.size, nom: caseNom },
    byMarket: group((r) => r.mkt), byBranch: group((r) => r.branch), byColl: group((r) => r.coll),
    topOverdue: sorted.slice(0, 10), topOverdueByMarket: byMkt, forecastByDate,
    marketingList: [...new Set(r2.map((r) => r.mkt))].sort(),
    lastTagihanUpdate: input.lastTagihanUpdate,
  };
}

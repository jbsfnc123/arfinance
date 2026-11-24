"use client";

import { useMemo } from "react";
import { card } from "@/components/ui";
import { LocalTable, type LCol } from "@/lib/local/table";
import { bpMonthSummary, NO_MONTH } from "@/lib/modules/sj/compute";
import type { SjState } from "./use-sj";
import { PeriodFilter, periodText, type Quick } from "./sj-view";

const n = (v: number) => v.toLocaleString("id-ID");
const pct1 = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
const MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** "2026-08" → "Agu 2026". */
export const monthShort = (m: string) => (m === NO_MONTH ? "Tanpa tanggal" : `${MON[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`);

type Row = Record<string, string | number>;
const MONTH_TONE = "bg-accent/[0.06]"; // bulan berselang (kontras rendah; aman terang/gelap)
const TOTAL_TONE = "bg-fg/[0.05]";

// Dashboard (Fase 86): ringkasan per Business Partner per bulan Tanggal SJ — SJ / Sudah / Belum per bulan + Total.
// Dihitung dari baris yang SAMA dengan Kertas Kerja (filter bersama; BP/Area yang tidak dicentang di Setting tidak ikut).
export function SjDashboard({ s, openKk }: { s: SjState; openKk: (o: { quick?: Quick; focus?: string }) => void }) {
  const sum = useMemo(() => bpMonthSummary(s.filtered), [s.filtered]);
  const rows = useMemo<Row[]>(() => sum.rows.map((r) => {
    const o: Row = { bp: r.bp, mg: r.marketing_group, total: r.total, done: r.done, open: r.open, pct: Math.round(r.pct * 10) / 10 };
    for (const m of sum.months) { const c = r.months[m]; o[`${m}|n`] = c?.n ?? 0; o[`${m}|d`] = c?.done ?? 0; o[`${m}|o`] = c?.open ?? 0; }
    return o;
  }), [sum]);
  const { setBp } = s;
  const cols = useMemo<LCol<Row>[]>(() => [
    { k: "bp", l: "Business Partner", w: 260,
      render: (r) => (
        <button type="button" className="text-left text-accent hover:underline" title="Lihat SJ Business Partner ini di Kertas Kerja"
          onClick={() => { setBp(String(r.bp)); openKk({}); }}>{String(r.bp)}</button>
      ) },
    { k: "mg", l: "Marketing Group" },
    // Fase 88: header bertingkat per bulan + pembatas kiri + warna lembut berselang agar tiap bulan mudah dibedakan.
    ...sum.months.flatMap((m, i): LCol<Row>[] => {
      const g = { group: monthShort(m), tone: i % 2 ? MONTH_TONE : undefined };
      return [
        { k: `${m}|n`, l: "Qty SJ", n: true, sum: true, ...g },
        { k: `${m}|d`, l: "Diterima", n: true, sum: true, ...g },
        { k: `${m}|o`, l: "Belum Diterima", n: true, sum: true, ...g },
      ];
    }),
    { k: "total", l: "Qty SJ", n: true, sum: true, group: "Total", tone: TOTAL_TONE },
    { k: "done", l: "Diterima", n: true, sum: true, group: "Total", tone: TOTAL_TONE },
    { k: "open", l: "Belum Diterima", n: true, sum: true, group: "Total", tone: TOTAL_TONE },
    { k: "pct", l: "% Diterima", n: true, group: "Total", tone: TOTAL_TONE },
  ], [sum.months, setBp, openKk]);

  if (s.loading) return <div className="h-40 animate-pulse rounded-xl bg-surface-2" aria-label="Memuat" />;
  const t = sum.total;

  return (
    <div className="space-y-4">
      <PeriodFilter s={s} />
      <p className="text-sm text-fg-2">{periodText(s)}</p>
      <div className={`${card} flex flex-wrap gap-x-8 gap-y-2 px-4 py-3 text-sm`} role="group" aria-label="Total">
        <Stat k="Business Partner" v={n(sum.rows.length)} />
        <Stat k="SJ" v={n(t.n)} />
        <Stat k="Diterima" v={n(t.done)} />
        <Stat k="Belum diterima" v={n(t.open)} />
        <Stat k="% Diterima" v={pct1(t.n ? (t.done / t.n) * 100 : null)} />
      </div>
      <LocalTable title="Ringkasan per Business Partner" stateKey="sj-dash-bp" rows={rows} cols={cols} rowKey={(r) => String(r.bp)}
        defaultSort={{ k: "total", dir: -1 }} search={["bp", "mg"]} emptyText="Tidak ada SJ pada filter ini." />
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-fg-2">{k}</div>
      <div className="text-lg font-medium tabular-nums">{v}</div>
    </div>
  );
}

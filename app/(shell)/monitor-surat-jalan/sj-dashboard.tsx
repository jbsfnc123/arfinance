"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { Chart } from "@/components/chart";
import { TableBox } from "@/components/table-box";
import { card, emptyTd, td, th } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { chartTheme, seriesColors } from "@/lib/ui/palette";
import { useResolvedTheme } from "@/lib/ui/prefs";
import { fmtAvg, STATUS_DONE, STATUS_OPEN, summarize, trendSeries } from "@/lib/modules/sj/compute";
import type { SjState } from "./use-sj";
import { PeriodFilter, periodText, type Quick } from "./sj-view";

const n = (v: number) => v.toLocaleString("id-ID");
const pct1 = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);

// Dashboard: dihitung dari baris SJ unik hasil filter yang sama dengan Kertas Kerja (satu definisi, compute.ts).
export function SjDashboard({ s, openKk }: { s: SjState; openKk: (o: { quick?: Quick; focus?: string }) => void }) {
  const sum = useMemo(() => summarize(s.filtered), [s.filtered]);
  const trend = useMemo(() => trendSeries(sum.trend), [sum.trend]);
  const theme = useResolvedTheme();
  const sc = seriesColors(theme), ct = chartTheme();

  if (s.loading) return <div className="h-40 animate-pulse rounded-xl bg-surface-2" aria-label="Memuat" />;

  const trendOpt: EChartsOption = {
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis" },
    legend: { top: 0, textStyle: { color: ct.text } },
    xAxis: { type: "category", data: trend.map((t) => (t.weekly ? `Mg ${fmtDate(t.label)}` : fmtDate(t.label))) },
    yAxis: { type: "value", name: "SJ", minInterval: 1, splitLine: { lineStyle: { color: ct.grid } } },
    series: [
      { name: STATUS_DONE, type: "bar", stack: "s", data: trend.map((t) => t.done), itemStyle: { color: sc.success } },
      { name: STATUS_OPEN, type: "bar", stack: "s", data: trend.map((t) => t.open), itemStyle: { color: sc.warning } },
    ],
  };
  const ageOpt: EChartsOption = {
    grid: { left: 8, right: 40, top: 8, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis" },
    xAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: ct.grid } } },
    yAxis: { type: "category", inverse: true, data: sum.ageBuckets.map((b) => b.label) },
    series: [{ name: STATUS_OPEN, type: "bar", data: sum.ageBuckets.map((b) => b.count), itemStyle: { color: sc.danger },
      label: { show: true, position: "right", color: ct.text } }],
  };
  const oldest = sum.oldestOpen;

  return (
    <div className="space-y-4">
      <PeriodFilter s={s} />
      <p className="text-sm text-fg-2">{periodText(s)}</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Total SJ unik" value={n(sum.total)} sub={`${n(sum.quality.sourceRows)} baris sumber`} />
        <Kpi label={STATUS_DONE} value={n(sum.done)} sub={pct1(sum.pct)} />
        <Kpi label={STATUS_OPEN} value={n(sum.open)} sub={sum.total ? pct1(100 - (sum.pct ?? 0)) : "—"}
          onClick={sum.open ? () => openKk({ quick: "open" }) : undefined} />
        <Kpi label="Rata-rata waktu penerimaan" value={fmtAvg(sum.avg)} strong
          sub={`${n(sum.sample)} SJ dihitung${sum.excluded ? ` · ${n(sum.excluded)} dikecualikan (tanggal bermasalah)` : ""}`} />
        <Kpi label="Belum diterima terlama" value={oldest ? `${n(oldest.umur!)} hari` : "—"} sub={oldest ? `${oldest.sj_no} · ${fmtDate(oldest.tanggal_sj)}` : "Tidak ada"}
          onClick={oldest ? () => openKk({ focus: oldest.sj_key }) : undefined} />
      </div>
      <p className="text-xs text-fg-2">
        Rata-rata waktu penerimaan = Receive Date penerimaan pertama yang diakui − Tanggal SJ (hari kalender), satu nilai per SJ.
        Durasi negatif, tanggal masa depan, dan Receive Date kosong tidak dihitung.
      </p>

      <section className={`${card} p-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-medium">Kualitas data</h2>
          <button type="button" className="ml-auto text-xs text-accent underline" onClick={() => openKk({ quick: "cek" })}>Lihat SJ yang perlu diperiksa</button>
        </div>
        <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Line k="Laporan penerimaan ganda" v={sum.quality.multi} />
          <Line k="Hanya Receiver di luar daftar" v={sum.quality.onlyOther} />
          <Line k="Masalah tanggal" v={sum.quality.dateIssues} />
          <Line k="Baris sumber → SJ unik" v={`${n(sum.quality.sourceRows)} → ${n(sum.quality.unique)}`} />
        </dl>
      </section>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className={`${card} p-4`}>
          <h2 className="text-sm font-medium">Tren {trend[0]?.weekly ? "mingguan" : "harian"} per Tanggal SJ</h2>
          {trend.length ? <Chart height={280} option={trendOpt} /> : <p className="py-10 text-center text-sm text-fg-2">Tidak ada SJ pada periode ini.</p>}
        </section>
        <section className={`${card} p-4`}>
          <h2 className="text-sm font-medium">Umur SJ belum diterima</h2>
          <Chart height={220} option={ageOpt} />
          <ul className="mt-2 space-y-0.5 text-xs text-fg-2">
            {sum.ageBuckets.map((b) => <li key={b.label} className="flex justify-between"><span>{b.label}</span><span className="tabular-nums text-fg">{n(b.count)} SJ</span></li>)}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${card} overflow-hidden`}>
          <h2 className="px-4 pt-3 text-sm font-medium">Per Receiver (penerimaan acuan)</h2>
          <TableBox bare fill={false} maxHeight="max-h-[50vh]" className="mt-2">
            <table className="w-full text-sm tabular-nums">
              <thead><tr className="border-b border-line"><th className={th}>Receiver</th><th className={`${th} text-right`}>SJ</th><th className={`${th} text-right`}>Rata-rata</th><th className={`${th} text-right`}>Sampel</th></tr></thead>
              <tbody>
                {sum.byReceiver.map((r) => (
                  <tr key={r.receiver} className="border-b border-line/50">
                    <td className={td}>{r.receiver}</td><td className={`${td} text-right`}>{n(r.count)}</td>
                    <td className={`${td} text-right`}>{fmtAvg(r.avg)}</td><td className={`${td} text-right`}>{n(r.sample)}</td>
                  </tr>
                ))}
                {!sum.byReceiver.length && <tr><td className={emptyTd} colSpan={4}>Belum ada SJ yang diterima.</td></tr>}
              </tbody>
              {sum.byReceiver.length > 0 && (
                <tfoot><tr className="font-medium"><td className={td}>Semua (rata-rata seluruh SJ)</td><td className={`${td} text-right`}>{n(sum.done)}</td>
                  <td className={`${td} text-right`}>{fmtAvg(sum.avg)}</td><td className={`${td} text-right`}>{n(sum.sample)}</td></tr></tfoot>
              )}
            </table>
          </TableBox>
        </section>
        <section className={`${card} overflow-hidden`}>
          <h2 className="px-4 pt-3 text-sm font-medium">Per Area</h2>
          <TableBox bare fill={false} maxHeight="max-h-[50vh]" className="mt-2">
            <table className="w-full text-sm tabular-nums">
              <thead><tr className="border-b border-line"><th className={th}>Area</th><th className={`${th} text-right`}>SJ</th><th className={`${th} text-right`}>Sudah</th><th className={`${th} text-right`}>Belum</th><th className={`${th} text-right`}>% Sudah</th><th className={`${th} text-right`}>Rata-rata</th></tr></thead>
              <tbody>
                {sum.byArea.map((a) => (
                  <tr key={a.area} className="border-b border-line/50">
                    <td className={td}>{a.area}</td><td className={`${td} text-right`}>{n(a.total)}</td><td className={`${td} text-right`}>{n(a.done)}</td>
                    <td className={`${td} text-right`}>{n(a.open)}</td><td className={`${td} text-right`}>{pct1(a.pct)}</td><td className={`${td} text-right`}>{fmtAvg(a.avg)}</td>
                  </tr>
                ))}
                {!sum.byArea.length && <tr><td className={emptyTd} colSpan={6}>Tidak ada SJ pada periode ini.</td></tr>}
              </tbody>
            </table>
          </TableBox>
        </section>
      </div>

      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
          <h2 className="text-sm font-medium">10 SJ belum diterima terlama</h2>
          {sum.open > 0 && <button type="button" className="ml-auto text-xs text-accent underline" onClick={() => openKk({ quick: "open" })}>Semua yang belum diterima ({n(sum.open)})</button>}
        </div>
        <TableBox bare fill={false} maxHeight="max-h-[50vh]" className="mt-2">
          <table className="w-full text-sm tabular-nums">
            <thead><tr className="border-b border-line"><th className={th}>SJ No.</th><th className={th}>Tanggal SJ</th><th className={th}>Area</th><th className={th}>Business Partner</th><th className={`${th} text-right`}>Umur</th></tr></thead>
            <tbody>
              {sum.topOpen.map((r) => (
                <tr key={r.sj_key} className="border-b border-line/50">
                  <td className={td}>
                    <button type="button" className="text-accent underline" onClick={() => openKk({ focus: r.sj_key })} aria-label={`Buka ${r.sj_no} di Kertas Kerja`}>{r.sj_no}</button>
                  </td>
                  <td className={td}>{fmtDate(r.tanggal_sj)}</td><td className={td}>{r.area}</td>
                  <td className={`${td} max-w-[18rem] truncate`} title={r.business_partner ?? ""}>{r.business_partner}</td>
                  <td className={`${td} text-right`}>{n(r.umur!)} hari</td>
                </tr>
              ))}
              {!sum.topOpen.length && <tr><td className={emptyTd} colSpan={5}>Semua SJ pada periode ini sudah diterima.</td></tr>}
            </tbody>
          </table>
        </TableBox>
      </section>
    </div>
  );
}

function Kpi({ label, value, sub, strong, onClick }: { label: string; value: string; sub?: string; strong?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <div className="text-xs text-fg-2">{label}</div>
      <div className={`mt-1 tabular-nums ${strong ? "text-2xl font-semibold" : "text-xl font-medium"}`}>{value}</div>
      {sub && <div className="text-xs text-fg-2">{sub}</div>}
      {onClick && <div className="mt-auto pt-1 text-xs text-accent">Lihat di Kertas Kerja ›</div>}
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className={`${card} flex flex-col items-stretch p-4 text-left transition-colors hover:bg-surface-2`}>{body}</button>
    : <div className={`${card} p-4`}>{body}</div>;
}

function Line({ k, v }: { k: string; v: number | string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line/40 py-1">
      <dt className="text-fg-2">{k}</dt>
      <dd className="text-right font-medium tabular-nums">{typeof v === "number" ? n(v) : v}</dd>
    </div>
  );
}

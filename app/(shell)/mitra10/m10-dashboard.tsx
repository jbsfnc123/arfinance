"use client";

import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { fmtDate, fmtTimestamp, monthLabel, rupiah } from "@/lib/format";
import { todayJakarta } from "@/lib/parsers/date";
import { m10Dashboard, type Stat } from "@/lib/modules/m10/compute";
import { Chart, CHART_GRID } from "@/components/chart";
import { ImportLog } from "@/components/import-log";
import { card, inputCls, td, th } from "@/components/ui";
import { useM10 } from "./use-m10";

const pct = (a: number, b: number) => (b ? `${(Math.floor((a / b) * 1000) / 10).toFixed(1)}%` : "0%");

// Port sheet Dashboard: dihitung di browser dari data lokal (dulu RPC SQL yang timeout).
export function M10Dashboard() {
  const m = useM10();
  const [month, setMonth] = useState<string | null>(null);
  const d = useMemo(() => (m.computed ? m10Dashboard(m.computed, m.agingLines, m.schedule, { month, today: todayJakarta(), lastAging: m.lastAging }) : null),
    [m.computed, m.agingLines, m.schedule, m.lastAging, month]);

  if (!d) return <div className="h-40 animate-pulse rounded-xl bg-surface-2" />;
  const s = d.summary;
  const jadwal = d.daily.filter((x) => Number(x.jadwal) !== 0);

  const chart: EChartsOption = {
    grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis" },
    legend: { top: 0, textStyle: { color: "#9aa0a6" } },
    xAxis: { type: "category", data: d.monthly.map((m) => monthLabel(m.month)) },
    yAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: CHART_GRID } } },
    series: [
      { name: "Done", type: "bar", stack: "a", data: d.monthly.map((m) => m.done), itemStyle: { color: "#81c995" } },
      { name: "Pending", type: "bar", stack: "a", data: d.monthly.map((m) => m.invoice - m.done), itemStyle: { color: "#fdd663" } },
    ],
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-fg-2">
        Update aging terakhir: {d.lastAging ? fmtTimestamp(d.lastAging) : "belum pernah"}
        {" · "}Pending {monthLabel(d.prevMonth)}: <b className="text-fg">{s.pendingPrev}</b>
        {" · "}Pending {monthLabel(d.curMonth)}: <b className="text-fg">{s.pendingCur}</b>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className={`${card} p-4`}>
          <h2 className="mb-2 text-sm font-medium">Ringkasan Kertas Kerja</h2>
          <Lines rows={[
            ["Total invoice di Kertas Kerja", s.total],
            ["Invoice outstanding", s.outstanding],
            ["Open Amt outstanding", rupiah(s.openOutstanding)],
            ["Invoice lunas", s.lunas],
            ["GR pending (outstanding)", s.grPending],
            ["Siap tukar faktur (GR Done, TF Pending)", s.siapTukar],
            ["Tukar faktur Done", `${s.tfDone} (${pct(s.tfDone, s.outstanding)})`],
            ["Selisih tidak nol (TF Done)", s.selisihNonZero],
            ["LTKP / Litigasi", `${s.ltkp} / ${s.litigasi}`],
            ["GR Update perlu dicek (Check)", d.grCheck],
            ["Invoice aging belum masuk Kertas Kerja", d.agingNotInWorksheet],
          ]} />
        </section>
        <section className={`${card} p-4`}>
          <h2 className="mb-2 text-sm font-medium">Data Aging (Master Aging)</h2>
          <Lines rows={[
            ["Jumlah invoice aging", d.aging.count],
            ["Total Open Amt", rupiah(d.aging.totalOpen)],
            ...d.aging.buckets.map((b): [string, string] => [b.label, `${rupiah(b.value)} · ${pct(b.value, d.aging.totalOpen)}`]),
            ["Rata-rata umur (hari)", d.aging.avgDays],
          ]} />
        </section>
        <section className={`${card} p-4`}>
          <h2 className="mb-2 text-sm font-medium">Jadwal Bayar {monthLabel(d.month)}</h2>
          <Lines rows={[
            ...jadwal.map((x): [string, string] => [fmtDate(x.date), rupiah(x.jadwal)]),
            ["Total jadwal bayar", rupiah(jadwal.reduce((a, x) => a + Number(x.jadwal), 0))],
            ["Rata-rata tukar faktur → transfer", `${d.scheduleAvgDays ?? "-"} hari`],
          ]} />
        </section>
      </div>

      <section className={`${card} p-4`}>
        <h2 className="text-sm font-medium">Rekap bulanan tukar faktur (berdasarkan Invoice Date)</h2>
        <Chart option={chart} height={240} />
        <StatTable first="Bulan" rows={d.monthly.map((m) => ({ ...m, key: m.month, label: monthLabel(m.month) }))} />
      </section>

      <section className={`${card} p-4`}>
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium">Detail harian</h2>
          <select value={d.month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} ml-auto !w-auto`}>
            {[...d.months].reverse().map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
        <StatTable first="Tanggal" jadwal rows={d.daily.map((x) => ({ ...x, key: x.date, label: fmtDate(x.date) }))} />
      </section>

      <ImportLog module={["mitra10", "data"]} version={0} />
    </div>
  );
}

function Lines({ rows }: { rows: [string, string | number][] }) {
  return (
    <dl className="space-y-1 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-line/40 py-1">
          <dt className="text-fg-2">{k}</dt>
          <dd className="text-right font-medium">{typeof v === "number" ? v.toLocaleString("id-ID") : v}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatTable({ first, rows, jadwal }: { first: string; jadwal?: boolean; rows: (Stat & { key: string; label: string; jadwal?: number })[] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line">
            <th className={th}>{first}</th><th className={`${th} text-right`}>Invoice</th><th className={`${th} text-right`}>Done</th>
            <th className={`${th} text-right`}>Pending</th><th className={`${th} text-right`}>% Done</th><th className={`${th} text-right`}>Rata2 hari</th>
            {jadwal && <th className={`${th} text-right`}>Jadwal Bayar</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-line/50">
              <td className={td}>{r.label}</td>
              <td className={`${td} text-right`}>{r.invoice}</td>
              <td className={`${td} text-right`}>{r.done}</td>
              <td className={`${td} text-right`}>{r.invoice - r.done}</td>
              <td className={`${td} text-right`}>{pct(r.done, r.invoice)}</td>
              <td className={`${td} text-right`}>{r.avgLama ?? "-"}</td>
              {jadwal && <td className={`${td} text-right`}>{r.jadwal ? Number(r.jadwal).toLocaleString("id-ID") : ""}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

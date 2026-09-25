"use client";

import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { createClient } from "@/lib/supabase/client";
import { cachedQuery } from "@/lib/cache/cached-query";
import { todayJakarta } from "@/lib/parsers/date";
import { monthLabel, rupiah } from "@/lib/format";
import { buildMutasi, type MutasiRaw } from "@/lib/modules/mutasi/dashboard";
import { Chart, CHART_GRID } from "@/components/chart";
import { useToast } from "@/components/toast";
import { card, inputCls, td, th } from "@/components/ui";

const COLORS = ["#8ab4f8", "#81c995", "#fdd663", "#f28b82", "#c58af9", "#78d9ec", "#fcad70"];
const juta = (n: number | null) => (n === null ? null : Math.round(n / 1e4) / 100);
const num = (n: number) => Math.round(n).toLocaleString("id-ID");

export function MutasiDashboard({ version }: { version: number }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const today = todayJakarta();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [raw, setRaw] = useState<MutasiRaw | null>(null);

  useEffect(() => {
    let cancelled = false;
    cachedQuery(supabase, {
      key: `mutasi:${month}`, deps: ["mutasi", "erp", "targets"],
      load: async () => {
        const { data, error } = await supabase.rpc("mutasi_dashboard", { p_month: month });
        if (error) throw error;
        return data as unknown as MutasiRaw;
      },
    }).then(({ data }) => { if (!cancelled) setRaw(data); })
      .catch((e: Error) => { if (!cancelled) toast(`Gagal memuat: ${e.message}`, "danger"); });
    return () => { cancelled = true; };
  }, [month, version, supabase, toast]);

  const v = raw ? buildMutasi(raw, today) : null;
  const days = v?.daily.map((d) => String(Number(d.date.slice(8)))) ?? [];

  const lineBase = (series: EChartsOption["series"]): EChartsOption => ({
    grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", valueFormatter: (x) => (x == null ? "-" : `${Number(x).toLocaleString("id-ID")} jt`) },
    legend: { top: 0, textStyle: { color: "#9aa0a6" } },
    xAxis: { type: "category", data: days, boundaryGap: false },
    yAxis: { type: "value", name: "Juta", splitLine: { lineStyle: { color: CHART_GRID } } },
    series,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-fg-2">Bulan</span>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} !w-auto`}>
          {(raw?.months?.length ? raw.months : [month]).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      {v && raw && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Total Uang Masuk" value={rupiah(v.total)} />
            <Kpi label="Allocated (Payment)" value={rupiah(v.alloc)} />
            <Kpi label="Allocated in Target" value={rupiah(v.allocT)} />
            <Kpi label="Target (Open Amt)" value={rupiah(v.target)} sub={`${v.targetCount.toLocaleString("id-ID")} invoice`} />
            <Kpi label="Realisasi / Target" value={`${(v.realisasi * 100).toFixed(1)}%`} />
            <Kpi label="Total Invoice Create" value={rupiah(v.inv)} />
            <Kpi label="Dikecualikan manual" value={rupiah(v.excluded)} sub={`${v.excludedCount.toLocaleString("id-ID")} transaksi tidak dihitung sebagai uang masuk`} />
            {raw.accounts.map((a) => <Kpi key={a} label={`Uang masuk ${a}`} value={rupiah(v.perAccount[a])} />)}
          </div>

          <section className={`${card} p-4`}>
            <h2 className="text-sm font-medium">Kumulatif uang masuk per rekening (juta)</h2>
            <Chart height={300} option={lineBase([
              ...raw.accounts.map((a, i) => ({ name: a, type: "line" as const, symbolSize: 4, data: v.daily.map((d) => juta(d.cumAccount[a])), itemStyle: { color: COLORS[i % COLORS.length] } })),
              { name: "Total", type: "line" as const, symbolSize: 4, lineStyle: { width: 3 }, data: v.daily.map((d) => juta(d.cumTotal)), itemStyle: { color: "#e8eaed" } },
            ])} />
          </section>

          <section className={`${card} p-4`}>
            <h2 className="text-sm font-medium">Kumulatif Total vs Allocated vs Allocated in Target (juta)</h2>
            <Chart height={300} option={lineBase([
              { name: "Total uang masuk", type: "line", symbolSize: 4, data: v.daily.map((d) => juta(d.cumTotal)), itemStyle: { color: "#8ab4f8" } },
              { name: "Allocated", type: "line", symbolSize: 4, data: v.daily.map((d) => juta(d.cumAlloc)), itemStyle: { color: "#81c995" } },
              { name: "Allocated in Target", type: "line", symbolSize: 4, data: v.daily.map((d) => juta(d.cumAllocT)), itemStyle: { color: "#fdd663" } },
            ])} />
          </section>

          <section className={`${card} overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className={th}>Tanggal</th>
                  {raw.accounts.map((a) => <th key={a} className={`${th} text-right`}>{a}</th>)}
                  <th className={`${th} text-right`}>Total</th><th className={`${th} text-right`}>Allocated</th>
                  <th className={`${th} text-right`}>Alloc in Target</th><th className={`${th} text-right`}>Invoice Create</th>
                </tr>
              </thead>
              <tbody>
                {v.daily.map((d) => (
                  <tr key={d.date} className={`border-b border-line/50 ${d.date === today ? "bg-surface-2" : ""}`}>
                    <td className={td}>{d.date.slice(8)}/{d.date.slice(5, 7)}</td>
                    {raw.accounts.map((a) => <td key={a} className={`${td} text-right`}>{num(d.perAccount[a])}</td>)}
                    <td className={`${td} text-right font-medium`}>{num(d.total)}</td>
                    <td className={`${td} text-right`}>{num(d.alloc)}</td>
                    <td className={`${td} text-right`}>{num(d.allocT)}</td>
                    <td className={`${td} text-right`}>{num(d.inv)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium">
                  <td className={td}>Total</td>
                  {raw.accounts.map((a) => <td key={a} className={`${td} text-right`}>{num(v.perAccount[a])}</td>)}
                  <td className={`${td} text-right`}>{num(v.total)}</td><td className={`${td} text-right`}>{num(v.alloc)}</td>
                  <td className={`${td} text-right`}>{num(v.allocT)}</td><td className={`${td} text-right`}>{num(v.inv)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={`${card} p-4`}>
      <div className="text-xs text-fg-2">{label}</div>
      <div className="mt-1 text-xl font-medium">{value}</div>
      {sub && <div className="text-xs text-fg-2">{sub}</div>}
    </div>
  );
}

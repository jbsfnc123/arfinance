"use client";

import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { createClient } from "@/lib/supabase/client";
import { cachedQuery } from "@/lib/cache/cached-query";
import { todayJakarta } from "@/lib/parsers/date";
import { monthLabel } from "@/lib/format";
import { tukarKpi, type TukarDay } from "@/lib/modules/tukar/dashboard";
import { Chart, CHART_GRID } from "@/components/chart";
import { useToast } from "@/components/toast";
import { card, inputCls } from "@/components/ui";

type Raw = { months: string[]; kurirs: string[]; days: TukarDay[] };

const SERIES: { key: keyof TukarDay; label: string; color: string; kpi: "Invoice" | "BP" | "Lokasi" }[] = [
  { key: "inv", label: "Jumlah Invoice", color: "#8ab4f8", kpi: "Invoice" },
  { key: "bp", label: "Jumlah Business Partner", color: "#81c995", kpi: "BP" },
  { key: "lok", label: "Titik Lokasi", color: "#fdd663", kpi: "Lokasi" },
];

export function TukarDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [month, setMonth] = useState(todayJakarta().slice(0, 7));
  const [kurir, setKurir] = useState("");
  const [data, setData] = useState<Raw | null>(null);

  useEffect(() => {
    let cancelled = false;
    cachedQuery(supabase, {
      key: `tukar:${month}:${kurir}`, deps: ["tukar"],
      load: async () => {
        const { data: res, error } = await supabase.rpc("tukar_dashboard", { p_month: month, p_kurir: kurir });
        if (error) throw error;
        return res as unknown as Raw;
      },
    }).then(({ data: res }) => { if (!cancelled) setData(res); })
      .catch((e: Error) => { if (!cancelled) toast(`Gagal memuat: ${e.message}`, "danger"); });
    return () => {
      cancelled = true;
    };
  }, [month, kurir, supabase, toast]);

  const kpi = data ? tukarKpi(data.days) : null;
  const months = data ? (data.months.includes(month) ? data.months : [month, ...data.months]) : [month];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-medium">Dashboard Tukar Faktur</h1>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} ml-auto !w-auto`}>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <select value={kurir} onChange={(e) => setKurir(e.target.value)} className={`${inputCls} !w-auto`}>
          <option value="">Semua Kolektor</option>
          {data?.kurirs.map((k) => <option key={k}>{k}</option>)}
        </select>
      </div>

      {kpi && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Kpi label="Total Invoice" value={kpi.totalInvoice} sub={`rata-rata ${kpi.avgInvoice}/hari`} />
          <Kpi label="Total Business Partner" value={kpi.totalBP} sub={`rata-rata ${kpi.avgBP}/hari`} />
          <Kpi label="Total Titik Lokasi" value={kpi.totalLokasi} sub={`rata-rata ${kpi.avgLokasi}/hari`} />
          <Kpi label="Hari Aktif" value={kpi.activeDays} sub={monthLabel(month)} />
        </div>
      )}

      {data && SERIES.map((s) => {
        const option: EChartsOption = {
          grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
          tooltip: { trigger: "axis" },
          xAxis: { type: "category", data: data.days.map((d) => String(d.day)), boundaryGap: false },
          yAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: CHART_GRID } } },
          series: [{
            type: "line", smooth: true, symbolSize: 5, data: data.days.map((d) => d[s.key]),
            lineStyle: { color: s.color }, itemStyle: { color: s.color }, areaStyle: { color: s.color, opacity: 0.15 },
          }],
        };
        return (
          <section key={s.key} className={`${card} p-4`}>
            <h2 className="text-sm font-medium">{s.label} per Hari</h2>
            <Chart option={option} height={200} />
          </section>
        );
      })}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className={`${card} p-4`}>
      <div className="text-xs text-fg-2">{label}</div>
      <div className="mt-1 text-2xl font-medium">{value.toLocaleString("id-ID")}</div>
      <div className="text-xs text-fg-2">{sub}</div>
    </div>
  );
}

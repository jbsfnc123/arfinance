"use client";

import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { monthLabel, rupiah } from "@/lib/format";
import {
  agingCards, categoryCounts, CATEGORY_CARDS, dueRecap,
  type CollectionRow, type Filters,
} from "@/lib/modules/collection/view-model";
import { collectionAllocationOf } from "@/lib/local/derived";
import { useDataset } from "@/lib/local/store";
import { todayJakarta } from "@/lib/parsers/date";
import { Chart, CHART_GRID } from "@/components/chart";
import { card, inputCls, td, th } from "@/components/ui";

type Props = { rows: CollectionRow[]; filters: Filters; setFilters: (f: Filters) => void };

const AGING_CARDS: { key: Filters["aging"]; label: string; color: string }[] = [
  { key: "Belum Jatuh Tempo", label: "Belum Jatuh Tempo", color: "text-success" },
  { key: "Sudah Jatuh Tempo", label: "Total Sudah Jatuh Tempo", color: "text-danger" },
  { key: "1-30 Hari", label: "1 - 30 Hari", color: "text-warning" },
  { key: "31-60 Hari", label: "31 - 60 Hari", color: "text-orange-300" },
  { key: ">60 Hari", label: "> 60 Hari", color: "text-danger" },
];

const CATEGORY_COLOR: Record<string, string> = {
  Case: "text-danger",
  "Janji Bayar": "text-accent",
  Reminder: "text-orange-300",
  "No Respon": "text-fg-2",
  "Tidak Ada Catatan": "text-fg",
};

export function KpiPanel({ rows, filters, setFilters, loading, collection }: Props & { loading: boolean; collection: string }) {
  const [open, setOpen] = useState(false);
  const aging = useMemo(() => agingCards(rows), [rows]);
  const due = useMemo(() => dueRecap(rows), [rows]);

  return (
    <section className={`${card} mt-4`}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="material-symbols-outlined">{open ? "expand_less" : "expand_more"}</span>
        <span className="font-medium">KPI Aging &amp; Rekap</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-line p-4">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {AGING_CARDS.map((c) => {
              const a = aging[c.key as string];
              const active = filters.aging === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setFilters({ ...filters, aging: active ? "" : c.key })}
                  className={`rounded-xl border p-3 text-left ${active ? "border-accent bg-pill/40" : "border-line bg-surface-2"}`}
                >
                  <div className={`text-xs ${c.color}`}>{c.label}</div>
                  <div className="mt-1 font-medium">{loading ? "…" : rupiah(a?.nominal)}</div>
                  <div className="text-xs text-fg-2">{a?.count ?? 0} invoice</div>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <AllocationChart collection={collection} />

            <div className="overflow-x-auto">
              <h3 className="mb-2 text-sm font-medium">Rekap Jatuh Tempo · per Bulan (Due Date)</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={th}>Bulan</th>
                    <th className={`${th} text-right`}>Invoice</th>
                    <th className={`${th} text-right`}>Nominal</th>
                  </tr>
                </thead>
                <tbody>
                  {due.months.map((m) => {
                    const active = filters.due === m.key;
                    return (
                      <tr
                        key={m.key}
                        onClick={() => setFilters({ ...filters, due: active ? null : m.key })}
                        className={`cursor-pointer border-t border-line hover:bg-surface-2 ${active ? "bg-pill/40" : ""}`}
                      >
                        <td className={td}>{m.key === "__KOSONG__" ? "Tanpa Tanggal" : monthLabel(m.key)}</td>
                        <td className={`${td} text-right`}>{m.count}</td>
                        <td className={`${td} text-right`}>{rupiah(m.nominal)}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-line font-medium">
                    <td className={td}>Semua Bulan</td>
                    <td className={`${td} text-right`}>{due.total.count}</td>
                    <td className={`${td} text-right`}>{rupiah(due.total.nominal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function CategoryCards({ rows, filters, setFilters }: Props) {
  const counts = useMemo(() => categoryCounts(rows), [rows]);
  return (
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
      {CATEGORY_CARDS.map((c) => {
        const active = filters.category === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => setFilters({ ...filters, category: active ? "" : c })}
            className={`rounded-xl border px-3 py-2 text-left ${active ? "border-accent bg-pill/40" : "border-line bg-surface"}`}
          >
            <div className={`text-xs ${CATEGORY_COLOR[c]}`}>{c === "Tidak Ada Catatan" ? "Belum Dicatat" : c}</div>
            <div className="text-sm font-medium">{counts[c].count} inv</div>
            <div className="text-xs text-fg-2">{rupiah(counts[c].nominal)}</div>
          </button>
        );
      })}
    </div>
  );
}

const juta = (n: number) => Math.round(n / 1e4) / 100;

// Pengganti "Rekap Tukar Faktur per Bulan": total alokasi (pembayaran ERP) collection ini per hari.
// Dataset erp/targets baru dimuat saat panel dibuka (komponen ini hanya dirender saat terbuka).
function AllocationChart({ collection }: { collection: string }) {
  const erp = useDataset("erp").data;
  const targets = useDataset("targets").data;
  const agingAll = useDataset("aging").data?.lines;
  const current = todayJakarta().slice(0, 7);
  const [month, setMonth] = useState(current);
  const a = useMemo(
    () => (erp && targets && agingAll ? collectionAllocationOf(month, collection, erp, targets, agingAll) : null),
    [month, collection, erp, targets, agingAll],
  );
  const months = useMemo(() => {
    const set = new Set([current, month, ...(a?.months ?? []), ...(targets?.targets.map((t) => t.month) ?? [])]);
    return [...set].filter(Boolean).sort().reverse();
  }, [current, month, a, targets]);

  if (!a) return <div className="text-sm text-fg-2">Memuat data alokasi…</div>;
  const option: EChartsOption = {
    grid: { left: 8, right: 8, top: 36, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", valueFormatter: (x) => (x == null ? "-" : `${Number(x).toLocaleString("id-ID")} jt`) },
    legend: { top: 0, textStyle: { color: "#9aa0a6" } },
    xAxis: { type: "category", data: a.days.map((d) => String(Number(d.date.slice(8)))) },
    yAxis: { type: "value", name: "Juta", splitLine: { lineStyle: { color: CHART_GRID } } },
    series: [
      { name: "Alloc in Target", type: "bar", stack: "a", data: a.days.map((d) => juta(d.inTarget)), itemStyle: { color: "#5f8fd8" }, barMaxWidth: 16 },
      { name: "Di luar target", type: "bar", stack: "a", data: a.days.map((d) => juta(d.outside)), itemStyle: { color: "#fdd663" }, barMaxWidth: 16 },
    ],
  };
  return (
    <div className="min-w-0">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">Total Alokasi · per Hari</h3>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} !w-auto !py-1 text-xs`}>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>
      <p className="text-xs text-fg-2">
        Total <b className="text-fg">{rupiah(a.total)}</b> · Alloc in Target {rupiah(a.inTarget)}
        {a.target ? <> dari target {rupiah(a.target)} (<b className="text-fg">{Math.round(a.pctTarget * 1000) / 10}%</b>)</> : " · belum ada target bulan ini"}
        {" "}· Di luar target {rupiah(a.outside)} · rata-rata {rupiah(Math.round(a.avgPerActiveDay))}/hari aktif
      </p>
      <Chart option={option} height={260} />
      {a.unmappedCount > 0 && (
        <p className="text-xs text-fg-2">
          {a.unmappedCount} pembayaran ({rupiah(a.unmapped)}) di bulan ini belum bisa dipetakan ke collection mana pun.
        </p>
      )}
    </div>
  );
}

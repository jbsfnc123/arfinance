"use client";

import { useMemo, useState } from "react";
import { monthLabel, rupiah } from "@/lib/format";
import {
  agingCards, categoryCounts, CATEGORY_CARDS, dueRecap, NO_DATE, TUKAR_METHODS, tukarRecap,
  type CollectionRow, type Filters, type TukarMetric,
} from "@/lib/modules/collection/view-model";
import { card, td, th } from "@/components/ui";

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

const cellBtn = (active: boolean) =>
  `rounded px-1.5 py-0.5 hover:bg-surface-2 ${active ? "bg-pill text-pill-fg" : ""}`;

export function KpiPanel({ rows, filters, setFilters, loading }: Props & { loading: boolean }) {
  const [open, setOpen] = useState(false);
  const aging = useMemo(() => agingCards(rows), [rows]);
  const tukar = useMemo(() => tukarRecap(rows), [rows]);
  const due = useMemo(() => dueRecap(rows), [rows]);

  const toggleTukar = (ym: string, metric: TukarMetric) => {
    const same = filters.tukar?.ym === ym && filters.tukar.metric === metric;
    setFilters({ ...filters, tukar: same ? null : { ym, metric } });
  };
  const isTukar = (ym: string, metric: TukarMetric) => filters.tukar?.ym === ym && filters.tukar.metric === metric;
  const metrics: { key: TukarMetric; label: string; cls?: string }[] = [
    { key: "total", label: "Total" },
    { key: "belum", label: "Belum TT", cls: "text-danger" },
    { key: "sudah", label: "Sudah TT", cls: "text-success" },
    ...TUKAR_METHODS.map((m) => ({ key: m as TukarMetric, label: m })),
  ];

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
            <div className="overflow-x-auto">
              <h3 className="mb-2 text-sm font-medium">Rekap Tukar Faktur · per Bulan (Invoice Date)</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={th}>Bulan</th>
                    {metrics.map((m) => <th key={m.key} className={`${th} text-right`}>{m.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[...tukar.months, { ...tukar.total, ym: "__ALL__" }].map((row) => {
                    const ym = row.ym === "__ALL__" ? "" : row.ym;
                    const isTotal = row.ym === "__ALL__";
                    return (
                      <tr key={row.ym || "tanpa"} className={`border-t border-line ${isTotal ? "font-medium" : ""}`}>
                        <td className={td}>{isTotal ? "Semua Bulan" : monthLabel(row.ym)}</td>
                        {metrics.map((m) => (
                          <td key={m.key} className={`${td} text-right ${m.cls ?? ""}`}>
                            {/* Baris total: ym "" = semua bulan; baris "(Tanpa Tgl)" juga "" tetapi hanya invoice tanpa tanggal */}
                            <button
                              type="button"
                              className={cellBtn(isTukar(isTotal ? "" : ym || NO_DATE, m.key))}
                              onClick={() => toggleTukar(isTotal ? "" : ym || NO_DATE, m.key)}
                            >
                              {Number(row[m.key]) || 0}
                            </button>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

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

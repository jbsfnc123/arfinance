"use client";

import { useMemo, useState } from "react";
import { useDataset } from "@/lib/local/store";
import { todayJakarta } from "@/lib/parsers/date";
import { fmtDate, monthLabel } from "@/lib/format";
import { tukarDays, tukarKpi, type TukarDay } from "@/lib/modules/tukar/dashboard";
import { card, inputCls, td, th } from "@/components/ui";

type Raw = { months: string[]; kurirs: string[]; days: TukarDay[] };


export function TukarDashboard() {
  const [month, setMonth] = useState(todayJakarta().slice(0, 7));
  const [kurir, setKurir] = useState("");
  const tukar = useDataset("tukar");
  // Dihitung di browser dari data lokal (port tukar_dashboard).
  const data: Raw | null = useMemo(() => (tukar.data ? tukarDays(tukar.data.done, month, kurir) : null), [tukar.data, month, kurir]);

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

      {data && kpi && (
        <section className={`${card} overflow-hidden`}>
          <h2 className="px-4 pt-4 text-sm font-medium">Tukar Faktur per Hari · {monthLabel(month)}</h2>
          <div className="mt-2 max-h-[65vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-line">
                  <th className={th}>Tanggal</th>
                  <th className={`${th} text-right`}>Jumlah Invoice</th>
                  <th className={`${th} text-right`}>Jumlah Business Partner</th>
                  <th className={`${th} text-right`}>Titik Lokasi</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((d) => {
                  const idle = !d.inv && !d.bp && !d.lok;
                  return (
                    <tr key={d.day} className={`border-b border-line/50 ${idle ? "text-fg-2 opacity-60" : ""}`}>
                      <td className={td}>{fmtDate(`${month}-${String(d.day).padStart(2, "0")}`)}</td>
                      <td className={`${td} text-right`}>{d.inv.toLocaleString("id-ID")}</td>
                      <td className={`${td} text-right`}>{d.bp.toLocaleString("id-ID")}</td>
                      <td className={`${td} text-right`}>{d.lok.toLocaleString("id-ID")}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 bg-surface font-medium">
                <tr className="border-t border-line">
                  <td className={td}>Total ({kpi.activeDays} hari aktif)</td>
                  <td className={`${td} text-right`}>{kpi.totalInvoice.toLocaleString("id-ID")}</td>
                  <td className={`${td} text-right`}>{kpi.totalBP.toLocaleString("id-ID")}</td>
                  <td className={`${td} text-right`}>{kpi.totalLokasi.toLocaleString("id-ID")}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
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

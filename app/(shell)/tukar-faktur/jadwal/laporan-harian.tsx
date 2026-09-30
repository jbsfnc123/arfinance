"use client";

import { useMemo } from "react";
import { useDataset } from "@/lib/local/store";
import { todayJakarta } from "@/lib/parsers/date";
import { fmtDate, monthLabel } from "@/lib/format";
import { tukarDays, tukarKpi } from "@/lib/modules/tukar/dashboard";
import { useViewState } from "@/lib/ui/view-state";
import { card, emptyTd, inputCls, td, th } from "@/components/ui";
import { TableBox } from "@/components/table-box";

// Laporan Harian kolektor (pindahan Dashboard Tukar Faktur lama): tukar faktur Done per hari dari Aplikasi Kolektor —
// jumlah invoice, BP unik, titik lokasi unik. Tanpa kartu KPI; total ada di baris bawah tabel.
export function LaporanHarian() {
  const [month, setMonth] = useViewState("jadwal:laporan:month", todayJakarta().slice(0, 7));
  const [kurir, setKurir] = useViewState("jadwal:laporan:kurir", "");
  const tukar = useDataset("tukar");
  const data = useMemo(() => (tukar.data ? tukarDays(tukar.data.done, month, kurir) : null), [tukar.data, month, kurir]);
  const total = data ? tukarKpi(data.days) : null;
  const months = data ? (data.months.includes(month) ? data.months : [month, ...data.months]) : [month];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} !w-auto`} aria-label="Bulan">
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <select value={kurir} onChange={(e) => setKurir(e.target.value)} className={`${inputCls} !w-auto`} aria-label="Kolektor">
          <option value="">Semua Kolektor</option>
          {data?.kurirs.map((k) => <option key={k}>{k}</option>)}
        </select>
        {tukar.error && <span className="text-sm text-danger">Gagal memuat: {tukar.error.message}</span>}
      </div>

      <section className={`${card} overflow-hidden`}>
        <h2 className="px-4 pt-4 text-sm font-medium">Tukar Faktur per Hari · {monthLabel(month)}</h2>
        <TableBox bare className="mt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>Tanggal</th>
                <th className={`${th} text-right`}>Jumlah Invoice</th>
                <th className={`${th} text-right`}>Jumlah Business Partner</th>
                <th className={`${th} text-right`}>Titik Lokasi</th>
              </tr>
            </thead>
            <tbody>
              {!data && <tr><td className={emptyTd} colSpan={4}>Memuat…</td></tr>}
              {data?.days.map((d) => {
                const idle = !d.inv && !d.bp && !d.lok;
                return (
                  <tr key={d.day} className={`border-b border-line/50 ${idle ? "text-fg-2 opacity-60" : ""}`}>
                    <td className={td}>{fmtDate(`${month}-${String(d.day).padStart(2, "0")}`)}</td>
                    <td className={`${td} text-right tabular-nums`}>{d.inv.toLocaleString("id-ID")}</td>
                    <td className={`${td} text-right tabular-nums`}>{d.bp.toLocaleString("id-ID")}</td>
                    <td className={`${td} text-right tabular-nums`}>{d.lok.toLocaleString("id-ID")}</td>
                  </tr>
                );
              })}
            </tbody>
            {total && (
              <tfoot className="font-medium">
                <tr className="border-t border-line">
                  <td className={td}>Total ({total.activeDays} hari aktif)</td>
                  <td className={`${td} text-right tabular-nums`}>{total.totalInvoice.toLocaleString("id-ID")}</td>
                  <td className={`${td} text-right tabular-nums`}>{total.totalBP.toLocaleString("id-ID")}</td>
                  <td className={`${td} text-right tabular-nums`}>{total.totalLokasi.toLocaleString("id-ID")}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </TableBox>
      </section>
    </div>
  );
}

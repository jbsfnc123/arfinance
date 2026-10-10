"use client";

import { useMemo, useState } from "react";
import { useDataset } from "@/lib/local/store";
import { todayJakarta } from "@/lib/parsers/date";
import { monthLabel } from "@/lib/format";
import { tukarDays } from "@/lib/modules/tukar/dashboard";
import { useViewState } from "@/lib/ui/view-state";
import { btnGhost, card, emptyTd, inputCls, td, th } from "@/components/ui";
import { dailyReport } from "@/lib/modules/tukar/daily-report";
import { downloadXlsx } from "@/lib/xlsx-client";
import { TableBox } from "@/components/table-box";

const dateHeader = th.replace("text-left", "text-center");

// Laporan Harian kolektor (pindahan Dashboard Tukar Faktur lama): tukar faktur Done per hari dari Aplikasi Kolektor —
// Tanggal di kolom; invoice, BP unik, dan lokasi unik di baris. Total di kolom terakhir.
export function LaporanHarian() {
  const [month, setMonth] = useViewState("jadwal:laporan:month", todayJakarta().slice(0, 7));
  const [kurir, setKurir] = useViewState("jadwal:laporan:kurir", "");
  const tukar = useDataset("tukar");
  const data = useMemo(() => (tukar.data ? tukarDays(tukar.data.done, month, kurir) : null), [tukar.data, month, kurir]);
  const report = useMemo(() => data ? dailyReport(month, data.days, kurir) : null, [data, month, kurir]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  async function exportExcel() {
    if (!report || exporting) return;
    setExporting(true); setExportError("");
    try { await downloadXlsx(`Laporan Harian Kolektor ${month} ${kurir || "Semua"}.xlsx`, "Laporan Harian", report.excel); }
    catch (e) { setExportError(e instanceof Error ? e.message : "Ekspor gagal. Silakan coba lagi."); }
    finally { setExporting(false); }
  }
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
        <button type="button" className={`${btnGhost} ml-auto`} disabled={!report || tukar.loading || !!tukar.error || exporting} onClick={() => void exportExcel()}>
          {exporting ? "Mengekspor…" : "Export Excel"}
        </button>
        {exportError && <span role="alert" className="text-sm text-danger">Gagal mengekspor: {exportError}</span>}
        {tukar.error && <span className="text-sm text-danger">Gagal memuat: {tukar.error.message}</span>}
      </div>

      <section className={`${card} overflow-hidden`}>
        <h2 className="px-4 pt-4 text-sm font-medium">Tukar Faktur per Hari · {monthLabel(month)}</h2>
        <p className="px-4 pt-1 text-xs text-fg-2">{report?.activeDays ?? 0} hari aktif</p>
        <TableBox bare fill={false} className="mt-2">
          <table className="w-full text-sm">
            <caption className="sr-only">Laporan harian {monthLabel(month)} · {kurir || "Semua Kolektor"}</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={`${dateHeader} sticky left-0 z-[2] min-w-44 bg-surface`}>Tanggal</th>
                {report?.columns.map((c) => (
                  <th key={c.day} scope="col" aria-label={`${c.day}${c.sunday ? " (Minggu)" : ""}`} className={`${dateHeader} min-w-14 tabular-nums ${c.sunday ? "bg-danger/15 text-danger" : ""}`}>{c.day}</th>
                ))}
                <th scope="col" className={`${th} min-w-20 text-right`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {!report && <tr><td className={emptyTd} colSpan={2}>{tukar.error ? "Data gagal dimuat" : "Memuat…"}</td></tr>}
              {report?.rows.map((r) => (
                <tr key={r.label} className="border-b border-line/50">
                  <th scope="row" className={`${td} sticky left-0 z-[1] bg-surface text-left font-medium whitespace-nowrap`}>{r.label}</th>
                  {r.values.map((v, i) => (
                    <td key={report.columns[i].day} className={`${td} text-center tabular-nums ${report.columns[i].sunday ? "bg-danger/15 text-danger" : v === 0 ? "text-fg-2" : ""}`}>{v.toLocaleString("id-ID")}</td>
                  ))}
                  <td className={`${td} text-right font-semibold tabular-nums`}>{r.total.toLocaleString("id-ID")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableBox>
      </section>
    </div>
  );
}

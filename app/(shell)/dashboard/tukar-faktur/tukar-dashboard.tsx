"use client";

import { useMemo } from "react";
import { useDataset } from "@/lib/local/store";
import { todayJakarta } from "@/lib/parsers/date";
import { monthLabel } from "@/lib/format";
import { tukarMonths, tukarSummary, type TfStat } from "@/lib/modules/tukar/summary";
import { useViewState } from "@/lib/ui/view-state";
import { card, inputCls, td, th } from "@/components/ui";
import { useM10 } from "../../mitra10/use-m10";
import { useRkm } from "../../rkm/use-rkm";

const n = (v: number) => v.toLocaleString("id-ID");
const hari = (v: number | null) => (v === null ? "–" : `${v.toLocaleString("id-ID")} hari`);
// Sama dengan dashboard Mitra10/RKM: dibulatkan ke bawah 1 desimal.
const pctTxt = (v: number | null) => (v === null ? "–" : `${(Math.floor(v * 1000) / 10).toFixed(1)}%`);

// Dashboard Tukar Faktur: per bulan invoice date — jumlah invoice, sudah tukar faktur, rata-rata hari invoice → TF.
// Urutan: Mitra10, RKM, Modern Market, Proyek. Laporan harian kolektor ada di menu Laporan & Jadwal Kolektor.
export function TukarDashboard() {
  const current = todayJakarta().slice(0, 7);
  const [month, setMonth] = useViewState("dash-tukar:month", current);
  const m10 = useM10();
  const rkm = useRkm();
  const aging = useDataset("aging");
  const activity = useDataset("activity");
  const loading = m10.loading || rkm.loading || !aging.data || !activity.data;

  const input = useMemo(() => ({
    m10: m10.computed?.worksheet ?? null,
    rkm: rkm.computed?.worksheet ?? null,
    aging: aging.data?.lines ?? [],
  }), [m10.computed, rkm.computed, aging.data]);
  const months = useMemo(() => tukarMonths({ ...input, current }), [input, current]);
  const rows: TfStat[] = useMemo(() => tukarSummary({
    ...input, month, exchanges: activity.data?.exchanges ?? [], m10Tax: m10.taxName, rkmTax: rkm.taxName,
  }), [input, month, activity.data, m10.taxName, rkm.taxName]);

  const tot = rows.reduce((s, r) => ({ invoice: s.invoice + r.invoice, done: s.done + r.done }), { invoice: 0, done: 0 });
  const withAvg = rows.filter((r) => r.avgHari !== null && r.done > 0);
  const totAvg = withAvg.length
    ? Math.round((withAvg.reduce((s, r) => s + r.avgHari! * r.done, 0) / withAvg.reduce((s, r) => s + r.done, 0)) * 10) / 10 : null;
  const err = m10.error ?? rkm.error ?? aging.error ?? activity.error;

  return (
    <div className="mx-auto max-w-[1800px] space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-medium">Dashboard Tukar Faktur</h1>
        <span className="text-sm text-fg-2">Periode bulan invoice date · rata-rata hari = tanggal tukar faktur − invoice date</span>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} ml-auto !w-auto`} aria-label="Bulan">
          {(months.includes(month) ? months : [month, ...months]).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      <section className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className={th}>Kelompok</th>
              <th className={`${th} text-right`}>Jumlah Invoice</th>
              <th className={`${th} text-right`}>Tukar Faktur</th>
              <th className={`${th} text-right`}>Belum TF</th>
              <th className={`${th} w-64`}>% Tukar Faktur</th>
              <th className={`${th} text-right`}>Rata-rata Hari</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-line/50">
                <td className={td}>
                  <div className="font-medium">{r.label}</div>
                  <div className="text-xs text-fg-2">{r.source}</div>
                </td>
                <td className={`${td} text-right tabular-nums`}>{loading ? "…" : n(r.invoice)}</td>
                <td className={`${td} text-right tabular-nums text-success`}>{loading ? "…" : n(r.done)}</td>
                <td className={`${td} text-right tabular-nums ${r.pending ? "text-warning" : ""}`}>{loading ? "…" : n(r.pending)}</td>
                <td className={td}>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-success" style={{ width: `${Math.round((r.pct ?? 0) * 100)}%` }} />
                    </div>
                    <span className="w-14 text-right tabular-nums">{loading ? "…" : pctTxt(r.pct)}</span>
                  </div>
                </td>
                <td className={`${td} text-right font-medium tabular-nums`}>{loading ? "…" : hari(r.avgHari)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-medium">
              <td className={td}>Total · {monthLabel(month)}</td>
              <td className={`${td} text-right tabular-nums`}>{n(tot.invoice)}</td>
              <td className={`${td} text-right tabular-nums`}>{n(tot.done)}</td>
              <td className={`${td} text-right tabular-nums`}>{n(tot.invoice - tot.done)}</td>
              <td className={td}>{pctTxt(tot.invoice ? tot.done / tot.invoice : null)}</td>
              <td className={`${td} text-right tabular-nums`}>{hari(totAvg)}</td>
            </tr>
          </tfoot>
        </table>
      </section>
      {err && <p className="text-sm text-danger">Sebagian data gagal dimuat: {err.message}</p>}
    </div>
  );
}

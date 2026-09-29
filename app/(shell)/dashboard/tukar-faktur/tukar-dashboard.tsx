"use client";

import { useMemo } from "react";
import { useDataset } from "@/lib/local/store";
import { todayJakarta } from "@/lib/parsers/date";
import { monthLabel } from "@/lib/format";
import { tukarMonths, tukarSummary, type TfKey, type TfRow, type TfStat } from "@/lib/modules/tukar/summary";
import { useRemarks } from "@/lib/modules/remarks";
import { LocalTable, type LCol } from "@/lib/local/table";
import { useViewState } from "@/lib/ui/view-state";
import { card, inputCls, td, th } from "@/components/ui";
import { useM10 } from "../../mitra10/use-m10";
import { useRkm } from "../../rkm/use-rkm";
import { Icon } from "@/components/icons";

const n = (v: number) => v.toLocaleString("id-ID");
const hari = (v: number | null) => (v === null ? "–" : `${v.toLocaleString("id-ID")} hari`);
// Sama dengan dashboard Mitra10/RKM: dibulatkan ke bawah 1 desimal.
const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "id"));

// Rincian: kolom default BP, Invoice, Invoice Date, Tgl Tukar Faktur, Nominal, Keterangan; sisanya bisa ditampilkan.
const DETAIL_COLS: LCol<TfRow>[] = [
  { k: "bp", l: "Business Partner", w: 240 },
  { k: "invoice_no", l: "Invoice", w: 170 },
  { k: "invoice_date", l: "Invoice Date", d: true, w: 100 },
  { k: "tf_date", l: "Tgl Tukar Faktur", d: true, w: 120 },
  { k: "nominal", l: "Nominal", n: true, sum: true, w: 130 },
  { k: "keterangan", l: "Keterangan", w: 260, wrap: true },
  { k: "no_sj", l: "No SJ", w: 160 },
  { k: "due_date", l: "Due Date", d: true, w: 100 },
  { k: "status", l: "Status TF", w: 100, badge: { "Sudah TF": "bg-success/15 text-success", "Belum TF": "bg-warning/15 text-warning" } },
  { k: "hari", l: "Lama TF (hari)", n: true, w: 100 },
  { k: "collection", l: "Collection", w: 130 },
];
const DETAIL_HIDDEN = ["no_sj", "due_date", "status", "hari", "collection"];

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
  const remarks = useRemarks();
  const [open, setOpen] = useViewState<TfKey | "">("dash-tukar:group", "");
  const loading = m10.loading || rkm.loading || !aging.data || !activity.data;

  const input = useMemo(() => ({
    m10: m10.computed?.worksheet ?? null,
    rkm: rkm.computed?.worksheet ?? null,
    aging: aging.data?.lines ?? [],
  }), [m10.computed, rkm.computed, aging.data]);
  const months = useMemo(() => tukarMonths({ ...input, current }), [input, current]);
  const rows: TfStat[] = useMemo(() => tukarSummary({
    ...input, month, exchanges: activity.data?.exchanges ?? [], m10Tax: m10.taxName, rkmTax: rkm.taxName, remarks: remarks.map,
  }), [input, month, activity.data, m10.taxName, rkm.taxName, remarks.map]);
  const sel = rows.find((r) => r.key === open) ?? null;

  const tot = rows.reduce((s, r) => ({ invoice: s.invoice + r.invoice, done: s.done + r.done }), { invoice: 0, done: 0 });
  const withAvg = rows.filter((r) => r.avgHari !== null && r.done > 0);
  const totAvg = withAvg.length
    ? Math.round((withAvg.reduce((s, r) => s + r.avgHari! * r.done, 0) / withAvg.reduce((s, r) => s + r.done, 0)) * 10) / 10 : null;
  const err = m10.error ?? rkm.error ?? aging.error ?? activity.error;

  return (
    <div className="mx-auto max-w-[1800px] space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-semibold tracking-tight">Dashboard Tukar Faktur</h1>
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
              <tr key={r.key} onClick={() => setOpen(open === r.key ? "" : r.key)} aria-expanded={open === r.key}
                className={`cursor-pointer border-b border-line/50 hover:bg-surface-2 ${open === r.key ? "bg-surface-2 shadow-[inset_3px_0_0_var(--color-accent)]" : ""}`}>
                <td className={td}>
                  <div className="flex items-center gap-1 font-medium">
                    <Icon name={open === r.key ? "expand_less" : "expand_more"} size={16} className="text-fg-2" />{r.label}
                  </div>
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
      {!sel && !loading && <p className="text-sm text-fg-2">Klik salah satu baris untuk melihat rincian invoice.</p>}

      {sel && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-lg font-medium">Rincian {sel.label} · {monthLabel(month)}</h2>
            <span className="text-sm text-fg-2">{n(sel.invoice)} invoice · {n(sel.done)} sudah tukar faktur</span>
            <button type="button" className="ml-auto text-sm text-accent hover:underline" onClick={() => setOpen("")}>Tutup rincian</button>
          </div>
          <LocalTable key={`${sel.key}:${month}`} title={`Tukar Faktur ${sel.label} ${monthLabel(month)}`}
            stateKey={`dash-tukar-${sel.key}`} hideKey="dash-tukar-detail" defaultHidden={DETAIL_HIDDEN}
            rows={sel.rows} cols={DETAIL_COLS} rowKey={(r) => r.key} loading={loading}
            search={["bp", "invoice_no", "no_sj", "keterangan"]}
            filters={[
              { k: "status", l: "Status TF", options: ["Sudah TF", "Belum TF"] },
              ...(sel.key === "mm" || sel.key === "proyek" ? [{ k: "collection" as const, l: "Collection", options: uniq(sel.rows.map((r) => r.collection)) }] : []),
            ]}
            emptyText="Tidak ada invoice pada bulan ini." />
        </section>
      )}
    </div>
  );
}

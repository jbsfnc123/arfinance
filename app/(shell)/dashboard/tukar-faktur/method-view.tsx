"use client";

import { useMemo } from "react";
import { card, td, th } from "@/components/ui";
import { fmtDate, fmtNum, monthLabel } from "@/lib/format";
import { useDataset } from "@/lib/local/store";
import { LocalTable, type LCol } from "@/lib/local/table";
import {
  breakdownStats, insights, METHODS, monthDays, monthlySummary, perDay, prepareRows, projection,
  type Breakdown, type MethodKey, type TfDoneRow,
} from "@/lib/modules/tukar/by-method";
import { todayJakarta } from "@/lib/parsers/date";
import { useViewState } from "@/lib/ui/view-state";

const MONTHS_SHOWN = 12;
const hari = (v: number | null) => (v === null ? "–" : `${v.toLocaleString("id-ID")} hari`);
const pct = (v: number | null) => (v === null ? "–" : `${(Math.round(v * 1000) / 10).toLocaleString("id-ID")}%`);
const dec = (v: number | null) => (v === null ? "–" : v.toLocaleString("id-ID"));
const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "id"));
const right = `${td} text-right tabular-nums`;

// Rincian per invoice. Nominal tersembunyi bawaan (fokus dashboard = jumlah invoice), bisa ditampilkan dari header.
const DETAIL_COLS: LCol<TfDoneRow>[] = [
  { k: "tanggal", l: "Tgl Tukar Faktur", d: true, w: 120 },
  { k: "metode_label", l: "Metode", w: 120 },
  { k: "business_partner", l: "Business Partner", w: 240 },
  { k: "invoice_no", l: "Invoice", w: 170 },
  { k: "invoice_date", l: "Invoice Date", d: true, w: 100 },
  { k: "hari", l: "Lama TF (hari)", n: true, w: 110 },
  { k: "kurir", l: "Kolektor", w: 120 },
  { k: "resi", l: "No Resi", w: 150 },
  { k: "kuitansi", l: "No Kuitansi EDI", w: 200, wrap: true },
  { k: "collection_name", l: "Collection", w: 140 },
  { k: "nominal", l: "Nominal", n: true, w: 140 },
];
const DETAIL_HIDDEN = ["resi", "kuitansi", "collection_name", "nominal"];

// Dashboard Tukar Faktur (Fase 81c): hanya angka & tabel — kesimpulan otomatis, ringkasan bulan terpilih per metode,
// ringkasan per bulan, rincian Kolektor/Ekspedisi, dan daftar invoice. Ukuran = jumlah invoice yang sudah tukar faktur
// (bulan = tanggal TF). Tanpa perbandingan antarbulan: invoice lunas bisa hilang dari data, bulan lampau tidak setara.
export function MethodDashboard() {
  const ds = useDataset("tfsum");
  const rows = useMemo(() => prepareRows(ds.data?.rows ?? []), [ds.data]);
  const summary = useMemo(() => monthlySummary(rows), [rows]);
  const today = todayJakarta();
  const [monthSel, setMonth] = useViewState("dash-tukar:tf-month", "");
  const [method, setMethod] = useViewState<MethodKey | "">("dash-tukar:tf-method", "");
  const month = monthSel && summary.some((s) => s.month === monthSel) ? monthSel : summary[0]?.month ?? today.slice(0, 7);
  const cur = summary.find((s) => s.month === month);
  const shown = useMemo(() => summary.slice(0, MONTHS_SHOWN), [summary]);
  // Tanpa useMemo manual: React Compiler memoisasi sendiri (filter ringan).
  const monthRows = rows.filter((r) => r.bulan === month);
  const detailRows = method ? monthRows.filter((r) => r.method === method) : monthRows;
  const methodsShown = METHODS.filter((m) => m.key !== "lainnya" || shown.some((s) => s.by.lainnya.inv > 0));
  const keys = methodsShown.map((m) => m.key);

  if (ds.error) return <p className="text-sm text-danger">Data tukar faktur gagal dimuat: {ds.error.message}</p>;
  if (!ds.data) return <div className="h-48 animate-pulse rounded-2xl bg-surface-2" aria-label="Memuat" />;
  if (!summary.length || !cur) return <p className="py-10 text-center text-sm text-fg-2">Belum ada data tukar faktur.</p>;

  const { running, elapsed } = monthDays(month, today);
  const title = `${monthLabel(month)}${running ? ` (s/d tanggal ${elapsed})` : ""}`;
  const points = insights({ month, monthName: monthLabel(month), row: cur, rows: monthRows, today, methods: keys });
  const tableRows = methodsShown.filter((m) => m.key !== "lainnya" || cur.by.lainnya.inv > 0).map((m) => ({ key: m.key, label: m.label, c: cur.by[m.key] }));
  const kolektor = breakdownStats(monthRows, "kolektor"), ekspedisi = breakdownStats(monthRows, "ekspedisi");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-fg-2">Jumlah invoice yang <b>sudah tukar faktur</b> per metode, berdasarkan <b>bulan tanggal tukar faktur</b> (EDI Mitra10 = Kuitansi Date).</p>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="ml-auto rounded-lg border border-hairline bg-surface px-2 py-1.5 text-sm" aria-label="Bulan tukar faktur">
          {summary.map((s) => <option key={s.month} value={s.month}>{monthLabel(s.month)}</option>)}
        </select>
      </div>

      <section className={`${card} p-4`} aria-label="Kesimpulan">
        <h2 className="text-sm font-semibold">Kesimpulan · {title}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-relaxed">
          {points.map((p, i) => (
            <li key={i}>{p.parts.map((x, j) => (
              <span key={j} className={`${x.b ? "font-semibold" : ""} ${x.warn ? "font-medium text-warning" : ""}`}>{x.t}</span>
            ))}</li>
          ))}
        </ul>
      </section>

      <section className={`${card} overflow-x-auto`}>
        <div className="px-4 pt-3">
          <h2 className="text-sm font-semibold">Ringkasan {title}</h2>
          <p className="text-xs text-fg-2">Klik baris metode untuk menyaring rincian invoice di bawah.</p>
        </div>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className={th}>Metode</th>
              <th className={`${th} text-right`}>Invoice TF</th>
              <th className={`${th} text-right`}>Porsi</th>
              <th className={`${th} text-right`}>BP</th>
              <th className={`${th} text-right`}>Rata-rata hari invoice → TF</th>
              <th className={`${th} text-right`}>Rata-rata per hari</th>
              {running && <th className={`${th} text-right`}>Perkiraan akhir bulan</th>}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((r) => (
              <tr key={r.key} onClick={() => setMethod(method === r.key ? "" : r.key)} aria-selected={method === r.key}
                className={`cursor-pointer border-b border-line/50 hover:bg-surface-2 ${method === r.key ? "bg-surface-2 shadow-[inset_3px_0_0_var(--color-accent)]" : ""}`}>
                <td className={`${td} font-medium`}>{r.label}</td>
                <td className={`${right} font-semibold`}>{r.c.inv ? fmtNum(r.c.inv) : <span className="font-normal text-warning">0</span>}</td>
                <td className={right}>{pct(cur.total.inv ? r.c.inv / cur.total.inv : null)}</td>
                <td className={right}>{fmtNum(r.c.bp)}</td>
                <td className={right}>{hari(r.c.avgHari)}</td>
                <td className={right}>{dec(perDay(r.c.inv, month, today))}</td>
                {running && <td className={right}>{fmtNum(projection(r.c.inv, month, today) ?? 0)}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr onClick={() => setMethod("")} className={`cursor-pointer font-semibold hover:bg-surface-2 ${!method ? "bg-surface-2" : ""}`}>
              <td className={td}>Total</td>
              <td className={right}>{fmtNum(cur.total.inv)}</td>
              <td className={right}>100%</td>
              <td className={right}>{fmtNum(cur.total.bp)}</td>
              <td className={right}>{hari(cur.total.avgHari)}</td>
              <td className={right}>{dec(perDay(cur.total.inv, month, today))}</td>
              {running && <td className={right}>{fmtNum(projection(cur.total.inv, month, today) ?? 0)}</td>}
            </tr>
          </tfoot>
        </table>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <BreakdownTable title={`Kolektor per nama · ${title}`} label="Kolektor" rows={kolektor} />
        <BreakdownTable title={`Ekspedisi per Collection · ${title}`} label="Collection" rows={ekspedisi} />
      </div>

      <section className={`${card} overflow-x-auto`}>
        <div className="px-4 pt-3">
          <h2 className="text-sm font-semibold">Ringkasan per bulan</h2>
          <p className="text-xs text-fg-2">Jumlah invoice sudah tukar faktur per bulan tanggal TF · klik baris untuk memilih bulan. Bulan lampau hanya memuat invoice yang masih tercatat saat ini (invoice lunas bisa tidak ikut), jadi tidak untuk dibandingkan antarbulan.</p>
        </div>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className={th}>Bulan TF</th>
              {methodsShown.map((m) => <th key={m.key} className={`${th} text-right`}>{m.label}</th>)}
              <th className={`${th} text-right`}>Total Invoice</th>
              <th className={`${th} text-right`}>BP</th>
              <th className={`${th} text-right`}>Rata-rata hari invoice → TF</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.month} onClick={() => setMonth(s.month)} aria-selected={s.month === month}
                className={`cursor-pointer border-b border-line/50 hover:bg-surface-2 ${s.month === month ? "bg-surface-2 shadow-[inset_3px_0_0_var(--color-accent)]" : ""}`}>
                <td className={`${td} font-medium`}>{monthLabel(s.month)}{monthDays(s.month, today).running ? <span className="text-xs font-normal text-fg-2"> (s/d {monthDays(s.month, today).elapsed})</span> : null}</td>
                {methodsShown.map((m) => <td key={m.key} className={right}>{s.by[m.key].inv ? fmtNum(s.by[m.key].inv) : "–"}</td>)}
                <td className={`${right} font-semibold`}>{fmtNum(s.total.inv)}</td>
                <td className={right}>{fmtNum(s.total.bp)}</td>
                <td className={right}>{hari(s.total.avgHari)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-lg font-medium">Rincian invoice {method ? METHODS.find((m) => m.key === method)!.label : "semua metode"} · {monthLabel(month)}</h2>
          <span className="text-sm text-fg-2">{fmtNum(detailRows.length)} invoice</span>
          {method && <button type="button" className="ml-auto text-sm text-accent hover:underline" onClick={() => setMethod("")}>Tampilkan semua metode</button>}
        </div>
        <LocalTable key={`${month}:${method}`} title={`Tukar Faktur ${method || "semua"} ${monthLabel(month)}`}
          stateKey="dash-tukar-metode" hideKey="dash-tukar-metode-v2" defaultHidden={DETAIL_HIDDEN}
          rows={detailRows} cols={DETAIL_COLS} rowKey={(r) => r.key}
          search={["business_partner", "invoice_no", "resi", "kuitansi", "kurir"]}
          filters={[
            { k: "metode_label", l: "Metode", options: uniq(monthRows.map((r) => r.metode_label)) },
            { k: "kurir", l: "Kolektor", options: uniq(detailRows.map((r) => r.kurir)) },
            { k: "collection_name", l: "Collection", options: uniq(detailRows.map((r) => r.collection_name)) },
          ]}
          defaultSort={{ k: "tanggal", dir: -1 }}
          emptyText="Tidak ada tukar faktur pada bulan ini." />
        <p className="text-xs text-fg-2">Lama TF = Tgl Tukar Faktur − Invoice Date. Data per {fmtDate(today)}.</p>
      </section>
    </div>
  );
}

function BreakdownTable({ title, label, rows }: { title: string; label: string; rows: Breakdown[] }) {
  const total = cellOfBreakdown(rows);
  return (
    <section className={`${card} overflow-x-auto`}>
      <h2 className="px-4 pt-3 text-sm font-semibold">{title}</h2>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="border-b border-line">
            <th className={th}>{label}</th>
            <th className={`${th} text-right`}>Invoice</th>
            <th className={`${th} text-right`}>Porsi</th>
            <th className={`${th} text-right`}>BP</th>
            <th className={`${th} text-right`}>Rata-rata hari</th>
          </tr>
        </thead>
        <tbody>
          {!rows.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-[13px] text-fg-2">Belum ada tukar faktur.</td></tr>}
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-line/50">
              <td className={`${td} font-medium`}>{r.name}</td>
              <td className={`${right} font-semibold`}>{fmtNum(r.inv)}</td>
              <td className={right}>{pct(r.share)}</td>
              <td className={right}>{fmtNum(r.bp)}</td>
              <td className={right}>{hari(r.avgHari)}</td>
            </tr>
          ))}
        </tbody>
        {rows.length > 1 && (
          <tfoot>
            <tr className="font-semibold">
              <td className={td}>Total</td>
              <td className={right}>{fmtNum(total)}</td>
              <td className={right}>100%</td>
              <td className={td} colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  );
}

const cellOfBreakdown = (rows: Breakdown[]) => rows.reduce((s, r) => s + r.inv, 0);

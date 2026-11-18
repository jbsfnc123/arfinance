"use client";

import { useMemo, useState } from "react";
import { DataTableModal, type Col, type TableSpec } from "@/components/data-table-modal";
import { card, td, th } from "@/components/ui";
import { fmtDate, fmtNum, monthLabel } from "@/lib/format";
import { useDataset } from "@/lib/local/store";
import { LocalTable, type LCol } from "@/lib/local/table";
import {
  breakdownStats, drillRows, drillTitle, METHODS, monthDays, monthlySummary, perDay, prepareRows, projection,
  type MethodKey, type TfDoneRow,
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

// Kolom modal rincian (klik angka). Tanggal ISO agar urut & Excel benar; tanpa baris total (hari tidak dijumlah).
const DRILL_COLS: Col[] = [
  { k: "tanggal", l: "Tgl Tukar Faktur" }, { k: "metode_label", l: "Metode" }, { k: "business_partner", l: "Business Partner" },
  { k: "invoice_no", l: "Invoice" }, { k: "invoice_date", l: "Invoice Date" }, { k: "hari", l: "Lama TF (hari)" },
  { k: "kurir", l: "Kolektor" }, { k: "resi", l: "No Resi" }, { k: "kuitansi", l: "No Kuitansi EDI" }, { k: "collection_name", l: "Collection" },
];

type Drill = { month: string; method?: MethodKey; kurir?: string };

/** Sel angka yang bisa diklik → rincian. */
function Num({ onClick, children, strong, className = "" }: { onClick: () => void; children: React.ReactNode; strong?: boolean; className?: string }) {
  return (
    <button type="button" onClick={onClick} title="Klik untuk melihat rincian & export Excel"
      className={`-mx-1 rounded px-1 tabular-nums underline-offset-2 hover:bg-accent/10 hover:text-accent hover:underline ${strong ? "font-semibold" : ""} ${className}`}>
      {children}
    </button>
  );
}

// Dashboard Tukar Faktur (Fase 81d): angka & tabel saja — ringkasan bulan terpilih per metode, Kolektor per nama,
// ringkasan per bulan, rincian invoice. SETIAP angka bisa diklik → modal rincian (cari, urut, export Excel).
// Ukuran = jumlah invoice yang sudah tukar faktur (bulan = tanggal TF). Tanpa perbandingan antarbulan.
export function MethodDashboard() {
  const ds = useDataset("tfsum");
  const rows = useMemo(() => prepareRows(ds.data?.rows ?? []), [ds.data]);
  const summary = useMemo(() => monthlySummary(rows), [rows]);
  const today = todayJakarta();
  const [monthSel, setMonth] = useViewState("dash-tukar:tf-month", "");
  const [spec, setSpec] = useState<TableSpec | null>(null);
  const month = monthSel && summary.some((s) => s.month === monthSel) ? monthSel : summary[0]?.month ?? today.slice(0, 7);
  const cur = summary.find((s) => s.month === month);
  const shown = useMemo(() => summary.slice(0, MONTHS_SHOWN), [summary]);
  // Tanpa useMemo manual: React Compiler memoisasi sendiri (filter ringan).
  const monthRows = rows.filter((r) => r.bulan === month);
  const methodsShown = METHODS.filter((m) => m.key !== "lainnya" || shown.some((s) => s.by.lainnya.inv > 0));

  if (ds.error) return <p className="text-sm text-danger">Data tukar faktur gagal dimuat: {ds.error.message}</p>;
  if (!ds.data) return <div className="h-48 animate-pulse rounded-2xl bg-surface-2" aria-label="Memuat" />;
  if (!summary.length || !cur) return <p className="py-10 text-center text-sm text-fg-2">Belum ada data tukar faktur.</p>;

  const nameOf = (m: string) => { const d = monthDays(m, today); return `${monthLabel(m)}${d.running ? ` (s/d ${d.elapsed})` : ""}`; };
  const open = (f: Drill) => setSpec({
    title: drillTitle({ monthName: nameOf(f.month), method: f.method, kurir: f.kurir }),
    rows: drillRows(rows, f).map((r) => ({ ...r })).sort((a, b) => b.tanggal.localeCompare(a.tanggal) || a.invoice_no.localeCompare(b.invoice_no)),
    cols: DRILL_COLS, noFoot: true,
  });
  const { running } = monthDays(month, today);
  const title = nameOf(month);
  const methodRows = methodsShown.filter((m) => m.key !== "lainnya" || cur.by.lainnya.inv > 0);
  const kolektor = breakdownStats(monthRows, "kolektor");
  const openAll = () => open({ month });
  const openKol = () => open({ month, method: "kolektor" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-fg-2">Jumlah invoice yang <b>sudah tukar faktur</b> per metode, berdasarkan <b>bulan tanggal tukar faktur</b> (EDI Mitra10 = Kuitansi Date). <b>Klik angka mana pun</b> untuk melihat rincian &amp; export Excel.</p>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="ml-auto rounded-lg border border-hairline bg-surface px-2 py-1.5 text-sm" aria-label="Bulan tukar faktur">
          {summary.map((s) => <option key={s.month} value={s.month}>{monthLabel(s.month)}</option>)}
        </select>
      </div>

      <section className={`${card} overflow-x-auto`}>
        <h2 className="px-4 pt-3 text-sm font-semibold">Ringkasan {title}</h2>
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
            {methodRows.map((m) => {
              const c = cur.by[m.key], go = () => open({ month, method: m.key });
              return (
                <tr key={m.key} className="border-b border-line/50">
                  <td className={`${td} font-medium`}><Num onClick={go}>{m.label}</Num></td>
                  <td className={right}><Num onClick={go} strong className={c.inv ? "" : "text-warning"}>{fmtNum(c.inv)}</Num></td>
                  <td className={right}><Num onClick={go}>{pct(cur.total.inv ? c.inv / cur.total.inv : null)}</Num></td>
                  <td className={right}><Num onClick={go}>{fmtNum(c.bp)}</Num></td>
                  <td className={right}><Num onClick={go}>{hari(c.avgHari)}</Num></td>
                  <td className={right}><Num onClick={go}>{dec(perDay(c.inv, month, today))}</Num></td>
                  {running && <td className={right}><Num onClick={go}>{fmtNum(projection(c.inv, month, today) ?? 0)}</Num></td>}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className={td}><Num onClick={openAll}>Total</Num></td>
              <td className={right}><Num onClick={openAll} strong>{fmtNum(cur.total.inv)}</Num></td>
              <td className={right}><Num onClick={openAll}>100%</Num></td>
              <td className={right}><Num onClick={openAll}>{fmtNum(cur.total.bp)}</Num></td>
              <td className={right}><Num onClick={openAll}>{hari(cur.total.avgHari)}</Num></td>
              <td className={right}><Num onClick={openAll}>{dec(perDay(cur.total.inv, month, today))}</Num></td>
              {running && <td className={right}><Num onClick={openAll}>{fmtNum(projection(cur.total.inv, month, today) ?? 0)}</Num></td>}
            </tr>
          </tfoot>
        </table>
      </section>

      <section className={`${card} overflow-x-auto xl:max-w-[60%]`}>
        <h2 className="px-4 pt-3 text-sm font-semibold">Kolektor per nama · {title}</h2>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className={th}>Kolektor</th>
              <th className={`${th} text-right`}>Invoice</th>
              <th className={`${th} text-right`}>Porsi</th>
              <th className={`${th} text-right`}>BP</th>
              <th className={`${th} text-right`}>Rata-rata hari</th>
            </tr>
          </thead>
          <tbody>
            {!kolektor.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-[13px] text-fg-2">Belum ada tukar faktur kolektor.</td></tr>}
            {kolektor.map((k) => {
              const go = () => open({ month, method: "kolektor", kurir: k.name });
              return (
                <tr key={k.name} className="border-b border-line/50">
                  <td className={`${td} font-medium`}><Num onClick={go}>{k.name}</Num></td>
                  <td className={right}><Num onClick={go} strong>{fmtNum(k.inv)}</Num></td>
                  <td className={right}><Num onClick={go}>{pct(k.share)}</Num></td>
                  <td className={right}><Num onClick={go}>{fmtNum(k.bp)}</Num></td>
                  <td className={right}><Num onClick={go}>{hari(k.avgHari)}</Num></td>
                </tr>
              );
            })}
          </tbody>
          {kolektor.length > 1 && (
            <tfoot>
              <tr className="font-semibold">
                <td className={td}><Num onClick={openKol}>Total</Num></td>
                <td className={right}><Num onClick={openKol} strong>{fmtNum(cur.by.kolektor.inv)}</Num></td>
                <td className={right}><Num onClick={openKol}>100%</Num></td>
                <td className={right}><Num onClick={openKol}>{fmtNum(cur.by.kolektor.bp)}</Num></td>
                <td className={right}><Num onClick={openKol}>{hari(cur.by.kolektor.avgHari)}</Num></td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      <section className={`${card} overflow-x-auto`}>
        <div className="px-4 pt-3">
          <h2 className="text-sm font-semibold">Ringkasan per bulan</h2>
          <p className="text-xs text-fg-2">Klik <b>nama bulan</b> untuk memilih bulan; klik angka untuk rincian. Bulan lampau hanya memuat invoice yang masih tercatat saat ini (invoice lunas bisa tidak ikut), jadi tidak untuk dibandingkan antarbulan.</p>
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
            {shown.map((s) => {
              const all = () => open({ month: s.month });
              return (
                <tr key={s.month} aria-selected={s.month === month}
                  className={`border-b border-line/50 ${s.month === month ? "bg-surface-2 shadow-[inset_3px_0_0_var(--color-accent)]" : ""}`}>
                  <td className={td}>
                    <button type="button" onClick={() => setMonth(s.month)} title="Pilih bulan ini"
                      className={`font-medium hover:text-accent hover:underline ${s.month === month ? "text-accent" : ""}`}>{nameOf(s.month)}</button>
                  </td>
                  {methodsShown.map((m) => (
                    <td key={m.key} className={right}>
                      {s.by[m.key].inv ? <Num onClick={() => open({ month: s.month, method: m.key })}>{fmtNum(s.by[m.key].inv)}</Num> : "–"}
                    </td>
                  ))}
                  <td className={right}><Num onClick={all} strong>{fmtNum(s.total.inv)}</Num></td>
                  <td className={right}><Num onClick={all}>{fmtNum(s.total.bp)}</Num></td>
                  <td className={right}><Num onClick={all}>{hari(s.total.avgHari)}</Num></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-lg font-medium">Rincian invoice · {monthLabel(month)}</h2>
          <span className="text-sm text-fg-2">{fmtNum(monthRows.length)} invoice</span>
        </div>
        <LocalTable key={month} title={`Tukar Faktur ${monthLabel(month)}`}
          stateKey="dash-tukar-metode" hideKey="dash-tukar-metode-v2" defaultHidden={DETAIL_HIDDEN}
          rows={monthRows} cols={DETAIL_COLS} rowKey={(r) => r.key}
          search={["business_partner", "invoice_no", "resi", "kuitansi", "kurir"]}
          filters={[
            { k: "metode_label", l: "Metode", options: uniq(monthRows.map((r) => r.metode_label)) },
            { k: "kurir", l: "Kolektor", options: uniq(monthRows.map((r) => r.kurir)) },
            { k: "collection_name", l: "Collection", options: uniq(monthRows.map((r) => r.collection_name)) },
          ]}
          defaultSort={{ k: "tanggal", dir: -1 }}
          emptyText="Tidak ada tukar faktur pada bulan ini." />
        <p className="text-xs text-fg-2">Lama TF = Tgl Tukar Faktur − Invoice Date. Data per {fmtDate(today)}.</p>
      </section>

      <DataTableModal spec={spec} onClose={() => setSpec(null)} />
    </div>
  );
}

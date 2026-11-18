"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { Chart } from "@/components/chart";
import { card, chip, td, th } from "@/components/ui";
import { fmtDate, fmtNum, monthLabel, rupiah } from "@/lib/format";
import { useDataset } from "@/lib/local/store";
import { LocalTable, type LCol } from "@/lib/local/table";
import { breakdown, cellOf, growth, METHODS, monthlySummary, prepareRows, type Cell, type MethodKey, type MonthRow, type TfDoneRow } from "@/lib/modules/tukar/by-method";
import { todayJakarta } from "@/lib/parsers/date";
import { categoryColors, chartTheme } from "@/lib/ui/palette";
import { useResolvedTheme } from "@/lib/ui/prefs";
import { useViewState } from "@/lib/ui/view-state";

// Warna per metode mengikuti entitas (urutan tetap, tidak berubah saat filter): Kolektor biru, Ekspedisi oranye,
// EDI Mitra10 hijau, Lainnya ungu — indeks categoryColors().
const COLOR_IDX: Record<MethodKey, number> = { kolektor: 1, ekspedisi: 0, edi: 2, lainnya: 4 };
const MONTHS_SHOWN = 12;

const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const shortMonth = (ym: string) => `${BULAN_PENDEK[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;
/** Rp ringkas: 27,2 M / 950 jt. */
const rpShort = (v: number) => (Math.abs(v) >= 1e9 ? `Rp ${(v / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`
  : Math.abs(v) >= 1e6 ? `Rp ${(v / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 0 })} jt` : rupiah(v));
const hari = (v: number | null) => (v === null ? "–" : `${v.toLocaleString("id-ID")} hari`);
const pct = (v: number) => `${(Math.round(v * 1000) / 10).toLocaleString("id-ID")}%`;
const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "id"));

const DETAIL_COLS: LCol<TfDoneRow>[] = [
  { k: "tanggal", l: "Tgl Tukar Faktur", d: true, w: 120 },
  { k: "metode_label", l: "Metode", w: 120 },
  { k: "business_partner", l: "Business Partner", w: 240 },
  { k: "invoice_no", l: "Invoice", w: 170 },
  { k: "invoice_date", l: "Invoice Date", d: true, w: 100 },
  { k: "nominal", l: "Nominal", n: true, sum: true, w: 140 },
  { k: "hari", l: "Lama TF (hari)", n: true, w: 110 },
  { k: "kurir", l: "Kolektor", w: 120 },
  { k: "resi", l: "No Resi", w: 150 },
  { k: "kuitansi", l: "No Kuitansi EDI", w: 200, wrap: true },
  { k: "collection_name", l: "Collection", w: 140 },
];
const DETAIL_HIDDEN = ["resi", "kuitansi", "collection_name"];

/** vs = label pembanding, mis. "Okt 26" atau "1–18 Okt" (bulan berjalan dibanding periode yang sama bulan lalu). */
function Growth({ now, prev, vs }: { now: number; prev?: number; vs?: string }) {
  const g = growth(now, prev);
  if (g === null || !vs) return null;
  const up = g >= 0;
  return (
    <span className={`${chip} ${up ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`} title={`Nominal dibanding ${vs}`}>
      {up ? "▲" : "▼"} {pct(Math.abs(g))} vs {vs}
    </span>
  );
}

function MethodCard({ label, hint, color, cell, prev, vs, share, active, onClick }: {
  label: string; hint: string; color?: string; cell: Cell; prev?: Cell; vs?: string; share?: number | null; active: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} title={hint}
      className={`${card} flex flex-col items-stretch gap-1 p-4 text-left transition-colors hover:bg-surface-2 ${active ? "ring-2 ring-accent" : ""}`}>
      <div className="flex items-center gap-2 text-xs text-fg-2">
        {color && <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} aria-hidden />}
        <span className="font-medium text-fg">{label}</span>
        {share !== undefined && share !== null && <span className="ml-auto tabular-nums">{pct(share)} nominal</span>}
      </div>
      <div className="text-2xl font-semibold tabular-nums" title={rupiah(cell.nominal)}>{rpShort(cell.nominal)}</div>
      <div className="text-xs text-fg-2 tabular-nums">
        {fmtNum(cell.inv)} invoice · {fmtNum(cell.bp)} BP · rata-rata {hari(cell.avgHari)}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <Growth now={cell.nominal} prev={prev?.nominal} vs={vs} />
        {cell.noNominal > 0 && <span className="text-[11px] text-warning">{fmtNum(cell.noNominal)} tanpa nominal</span>}
      </div>
    </button>
  );
}

// Dashboard per metode: invoice yang SUDAH tukar faktur, dikelompokkan per metode (Kolektor, Ekspedisi, EDI Mitra10),
// dirangkum per bulan TANGGAL TUKAR FAKTUR dengan fokus pada total nominal yang sudah ditukar.
export function MethodDashboard() {
  const ds = useDataset("tfsum");
  const theme = useResolvedTheme();
  const cat = categoryColors(theme), ct = chartTheme();
  const colorOf = (k: MethodKey) => cat[COLOR_IDX[k]];

  const rows = useMemo(() => prepareRows(ds.data?.rows ?? []), [ds.data]);
  const summary = useMemo(() => monthlySummary(rows), [rows]);
  const current = todayJakarta().slice(0, 7);
  const [monthSel, setMonth] = useViewState("dash-tukar:tf-month", "");
  const [method, setMethod] = useViewState<MethodKey | "">("dash-tukar:tf-method", "");
  const month = monthSel && summary.some((s) => s.month === monthSel) ? monthSel : summary[0]?.month ?? current;
  const idx = summary.findIndex((s) => s.month === month);
  const cur = summary[idx], prev = summary[idx + 1];
  const shown = useMemo(() => summary.slice(0, MONTHS_SHOWN), [summary]);
  const shownRows = useMemo(() => { const set = new Set(shown.map((x) => x.month)); return rows.filter((r) => set.has(r.bulan)); }, [rows, shown]);
  const methodsShown = METHODS.filter((m) => m.key !== "lainnya" || shown.some((s) => s.by.lainnya.inv > 0));

  const monthRows = useMemo(() => rows.filter((r) => r.bulan === month), [rows, month]);
  const detailRows = useMemo(() => (method ? monthRows.filter((r) => r.method === method) : monthRows), [monthRows, method]);
  const loading = !ds.data && !ds.error;

  const asc = [...shown].reverse();
  const chartOpt: EChartsOption = {
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    legend: { top: 0, textStyle: { color: ct.text }, itemWidth: 12, itemHeight: 10 },
    tooltip: {
      trigger: "axis", axisPointer: { type: "shadow" },
      valueFormatter: (v) => rupiah(Number(v)),
    },
    xAxis: { type: "category", data: asc.map((s) => shortMonth(s.month)), axisTick: { show: false }, axisLine: { lineStyle: { color: ct.grid } } },
    yAxis: { type: "value", splitLine: { lineStyle: { color: ct.grid } }, axisLabel: { formatter: (v: number) => (v >= 1e9 ? `${v / 1e9} M` : v >= 1e6 ? `${v / 1e6} jt` : `${v}`) } },
    series: methodsShown.map((m, i) => ({
      name: m.label, type: "bar", stack: "tf", barMaxWidth: 36,
      data: asc.map((s) => ({ value: s.by[m.key].nominal, itemStyle: { opacity: s.month === month ? 1 : 0.55 } })),
      itemStyle: {
        color: colorOf(m.key), borderColor: ct.surface, borderWidth: 1,
        borderRadius: i === methodsShown.length - 1 ? [4, 4, 0, 0] : 0,
      },
      emphasis: { focus: "series" },
    })),
  };

  if (ds.error) return <p className="text-sm text-danger">Data tukar faktur gagal dimuat: {ds.error.message}</p>;
  if (loading) return <div className="h-48 animate-pulse rounded-2xl bg-surface-2" aria-label="Memuat" />;
  if (!summary.length) return <p className="py-10 text-center text-sm text-fg-2">Belum ada data tukar faktur.</p>;

  const shownTotal = cellOf(shownRows);
  // Bulan berjalan belum genap: bandingkan dengan tanggal 1 s/d hari yang sama bulan sebelumnya.
  const today = todayJakarta(), todayDay = Number(today.slice(8, 10));
  const partial = (m: string) => m === today.slice(0, 7);
  const prevCells = (m: string, p?: MonthRow): { cells?: MonthRow; vs?: string } => {
    if (!p) return {};
    if (!partial(m)) return { cells: p, vs: shortMonth(p.month) };
    const rs = rows.filter((r) => r.bulan === p.month && Number(r.tanggal.slice(8, 10)) <= todayDay);
    return {
      cells: { month: p.month, by: Object.fromEntries(METHODS.map((x) => [x.key, cellOf(rs.filter((r) => r.method === x.key))])) as MonthRow["by"], total: cellOf(rs) },
      vs: `1–${todayDay} ${BULAN_PENDEK[Number(p.month.slice(5, 7)) - 1]}`,
    };
  };
  const cmp = prevCells(month, prev);
  const cardMethods = methodsShown.filter((m) => m.key !== "lainnya" || (cur?.by.lainnya.inv ?? 0) > 0);
  const share = (c: Cell) => (cur?.total.nominal ? c.nominal / cur.total.nominal : null);
  const kurir = breakdown(monthRows, "kolektor"), eksp = breakdown(monthRows, "ekspedisi");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-fg-2">
          Invoice yang <b>sudah tukar faktur</b>, per metode, berdasarkan <b>bulan tanggal tukar faktur</b>. Nominal: EDI Mitra10 = total Kwitansi; Kolektor/Ekspedisi = nilai invoice (ERP / Aging).
        </p>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="ml-auto rounded-lg border border-hairline bg-surface px-2 py-1.5 text-sm" aria-label="Bulan tukar faktur">
          {summary.map((s) => <option key={s.month} value={s.month}>{monthLabel(s.month)}</option>)}
        </select>
      </div>

      {cur && (
        <div className={`grid gap-3 sm:grid-cols-2 ${cardMethods.length > 3 ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
          <MethodCard label={`Total · ${monthLabel(month)}${partial(month) ? ` (s/d ${todayDay})` : ""}`} hint="Semua metode" cell={cur.total} prev={cmp.cells?.total} vs={cmp.vs}
            active={!method} onClick={() => setMethod("")} />
          {cardMethods.map((m) => (
            <MethodCard key={m.key} label={m.label} hint={m.hint} color={colorOf(m.key)} cell={cur.by[m.key]} prev={cmp.cells?.by[m.key]} vs={cmp.vs}
              share={share(cur.by[m.key])} active={method === m.key} onClick={() => setMethod(method === m.key ? "" : m.key)} />
          ))}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <section className={`${card} p-4`}>
          <h2 className="text-sm font-medium">Nominal sudah tukar faktur per bulan</h2>
          <p className="text-xs text-fg-2">{shown.length} bulan terakhir · klik batang untuk memilih bulan</p>
          <Chart height={300} option={chartOpt} onClick={(i) => asc[i] && setMonth(asc[i].month)} />
        </section>
        <section className={`${card} grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-1`}>
          <Breakdown title={`Kolektor per nama · ${shortMonth(month)}`} rows={kurir} color={colorOf("kolektor")} />
          <Breakdown title={`Ekspedisi per Collection · ${shortMonth(month)}`} rows={eksp} color={colorOf("ekspedisi")} />
        </section>
      </div>

      <section className={`${card} overflow-x-auto`}>
        <div className="px-4 pt-3">
          <h2 className="text-sm font-medium">Ringkasan per bulan</h2>
          <p className="text-xs text-fg-2">Jumlah invoice & nominal yang sudah tukar faktur · klik baris untuk melihat rinciannya</p>
        </div>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className={th} rowSpan={2}>Bulan TF</th>
              {methodsShown.map((m) => (
                <th key={m.key} className={`${th} text-center`} colSpan={2}>
                  <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: colorOf(m.key) }} aria-hidden />{m.label}</span>
                </th>
              ))}
              <th className={`${th} text-center`} colSpan={3}>Total</th>
            </tr>
            <tr className="border-b border-line">
              {methodsShown.map((m) => [
                <th key={`${m.key}-i`} className={`${th} text-right`}>Invoice</th>,
                <th key={`${m.key}-n`} className={`${th} text-right`}>Nominal</th>,
              ])}
              <th className={`${th} text-right`}>Invoice</th>
              <th className={`${th} text-right`}>Nominal</th>
              <th className={`${th} text-right`}>vs bln lalu</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s, i) => (
              <tr key={s.month} onClick={() => setMonth(s.month)} aria-selected={s.month === month}
                className={`cursor-pointer border-b border-line/50 hover:bg-surface-2 ${s.month === month ? "bg-surface-2 shadow-[inset_3px_0_0_var(--color-accent)]" : ""}`}>
                <td className={`${td} font-medium`}>{monthLabel(s.month)}</td>
                {methodsShown.map((m) => [
                  <td key={`${m.key}-i`} className={`${td} text-right tabular-nums text-fg-2`}>{s.by[m.key].inv ? fmtNum(s.by[m.key].inv) : "–"}</td>,
                  <td key={`${m.key}-n`} className={`${td} text-right tabular-nums`} title={rupiah(s.by[m.key].nominal)}>{s.by[m.key].inv ? fmtNum(s.by[m.key].nominal) : "–"}</td>,
                ])}
                <td className={`${td} text-right tabular-nums`}>{fmtNum(s.total.inv)}</td>
                <td className={`${td} text-right font-semibold tabular-nums`}>{fmtNum(s.total.nominal)}</td>
                <td className={`${td} text-right`}>{(() => { const c = prevCells(s.month, shown[i + 1]); return <Growth now={s.total.nominal} prev={c.cells?.total.nominal} vs={c.vs} />; })()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-medium">
              <td className={td}>Total {shown.length} bulan</td>
              {methodsShown.map((m) => {
                const c = cellOf(shownRows.filter((r) => r.method === m.key));
                return [
                  <td key={`${m.key}-i`} className={`${td} text-right tabular-nums`}>{fmtNum(c.inv)}</td>,
                  <td key={`${m.key}-n`} className={`${td} text-right tabular-nums`}>{fmtNum(c.nominal)}</td>,
                ];
              })}
              <td className={`${td} text-right tabular-nums`}>{fmtNum(shownTotal.inv)}</td>
              <td className={`${td} text-right tabular-nums`}>{fmtNum(shownTotal.nominal)}</td>
              <td className={td} />
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-lg font-medium">Rincian {method ? METHODS.find((m) => m.key === method)!.label : "semua metode"} · {monthLabel(month)}</h2>
          <span className="text-sm text-fg-2">{fmtNum(detailRows.length)} invoice · {rupiah(detailRows.reduce((s, r) => s + (r.nominal ?? 0), 0))}</span>
          {method && <button type="button" className="ml-auto text-sm text-accent hover:underline" onClick={() => setMethod("")}>Tampilkan semua metode</button>}
        </div>
        <LocalTable key={`${month}:${method}`} title={`Tukar Faktur ${method || "semua"} ${monthLabel(month)}`}
          stateKey="dash-tukar-metode" hideKey="dash-tukar-metode" defaultHidden={DETAIL_HIDDEN}
          rows={detailRows} cols={DETAIL_COLS} rowKey={(r) => r.key}
          search={["business_partner", "invoice_no", "resi", "kuitansi", "kurir"]}
          filters={[
            { k: "metode_label", l: "Metode", options: uniq(monthRows.map((r) => r.metode_label)) },
            { k: "kurir", l: "Kolektor", options: uniq(detailRows.map((r) => r.kurir)) },
            { k: "collection_name", l: "Collection", options: uniq(detailRows.map((r) => r.collection_name)) },
          ]}
          defaultSort={{ k: "tanggal", dir: -1 }}
          emptyText="Tidak ada tukar faktur pada bulan ini." />
        <p className="text-xs text-fg-2">Lama TF = Tgl Tukar Faktur − Invoice Date. Data per {fmtDate(todayJakarta())}.</p>
      </section>
    </div>
  );
}

function Breakdown({ title, rows, color }: { title: string; rows: { name: string; inv: number; nominal: number }[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.nominal));
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      {!rows.length ? <p className="py-3 text-xs text-fg-2">Tidak ada.</p> : (
        <ul className="mt-2 space-y-1.5">
          {rows.slice(0, 8).map((r) => (
            <li key={r.name} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs">
              <span className="truncate" title={r.name}>{r.name}</span>
              <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full rounded-full" style={{ width: `${(r.nominal / max) * 100}%`, background: color }} />
              </span>
              <span className="tabular-nums text-fg-2" title={rupiah(r.nominal)}>{rpShort(r.nominal)} · {fmtNum(r.inv)} inv</span>
            </li>
          ))}
          {rows.length > 8 && <li className="text-[11px] text-fg-2">+{rows.length - 8} lainnya</li>}
        </ul>
      )}
    </div>
  );
}

"use client";

import { Fragment, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { useDataset } from "@/lib/local/store";
import { arInvoices, computeSpvSummary, filterOf } from "@/lib/modules/collection/rows";
import { allocationSeries, reconcileCollected } from "@/lib/modules/collection/reconcile";
import { DataTableModal, type TableSpec } from "@/components/data-table-modal";
import { todayJakarta } from "@/lib/parsers/date";
import { fmtTimestamp, monthLabel, rupiah } from "@/lib/format";
import { AGING_BUCKETS } from "@/lib/modules/collection/aging";
import { pctColor, round1, type GroupRow, type SpvSummary } from "@/lib/modules/collection/spv-summary";
import { Chart, CHART_GRID } from "@/components/chart";
import { btnGhost, card, inputCls, td, th } from "@/components/ui";

const AGING_COLOR = ["#23ad7a", "#eebb3c", "#f08a3f", "#e25b5b"];

export function DashboardView({ months, initialMonth }: { months: string[]; initialMonth: string }) {
  const [month, setMonth] = useState(initialMonth);
  const aging = useDataset("aging");
  const targets = useDataset("targets");
  const activity = useDataset("activity");
  const settings = useDataset("settings");
  const erp = useDataset("erp");
  // Ringkasan dihitung di browser (port get_spv_summary) dan ikut berubah saat dataset diperbarui.
  const data: SpvSummary | null = useMemo(() => {
    if (!aging.data || !targets.data || !activity.data) return null;
    return computeSpvSummary({
      month, today: todayJakarta(), targets: targets.data.targets, promises: activity.data.promises, notes: activity.data.notes,
      ar: arInvoices(aging.data.lines, filterOf(settings.data)),
      lastTagihanUpdate: (settings.data?.last_tagihan_update as string | undefined) ?? aging.data.uploadedAt,
      agingAll: aging.data.lines,
    });
  }, [month, aging.data, targets.data, activity.data, settings.data]);
  // Alokasi Target & rekonsiliasi dari pembayaran ERP (data Mutasi vs Realisasi).
  const alloc = useMemo(() => (targets.data && erp.data
    ? allocationSeries({ month, today: todayJakarta(), targets: targets.data.targets, payments: erp.data.payments }) : null),
  [month, targets.data, erp.data]);
  const recon = useMemo(() => (targets.data && erp.data && aging.data
    ? reconcileCollected({ month, targets: targets.data.targets, agingAll: aging.data.lines, payments: erp.data.payments }) : null),
  [month, targets.data, erp.data, aging.data]);
  const loading = !data || aging.loading || targets.loading;
  const reload = () => { void aging.reload(); void targets.reload(); void activity.reload(); };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-medium">Dashboard Collection</h1>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} !w-auto`}>
          {(months.includes(month) ? months : [month, ...months]).map((m) => (
            <option key={m} value={m}>Target {monthLabel(m)}</option>
          ))}
        </select>
        <span className="text-xs text-fg-2">Data per: {fmtTimestamp(data?.lastTagihanUpdate)}</span>
        <button type="button" className={`${btnGhost} ml-auto`} onClick={reload} disabled={loading}>
          <span className="material-symbols-outlined">refresh</span>Refresh
        </button>
      </div>

      {!data ? (
        <p className="mt-10 text-center text-sm text-fg-2">{loading ? "Memuat…" : "Tidak ada data."}</p>
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : ""}>
          {data.invTotal === 0 && (
            <p className={`${card} mt-4 p-4 text-sm text-warning`}>
              Belum ada target untuk {monthLabel(month)}. Upload lewat Pengaturan → Upload Target Bulanan.
            </p>
          )}
          <KpiStrip d={data} />
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <DonutCard title="Pencapaian" d={data} kind="pencapaian" />
            <DonutCard title="Terkumpul + Janji Bayar" d={data} kind="forecast" />
            <AgingCard d={data} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <AllocationCard a={alloc} />
            <TopOverdue d={data} />
          </div>
          {recon && <ReconCard r={recon} />}
          <Breakdown d={data} />
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, badge }: { label: string; value: string; sub: string; badge?: string }) {
  return (
    <div className={`${card} p-4`}>
      <div className="flex items-center gap-2 text-xs text-fg-2">
        {label}
        {badge && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg">{badge}</span>}
      </div>
      <div className="mt-1 text-lg font-medium">{value}</div>
      <div className="text-xs text-fg-2">{sub}</div>
    </div>
  );
}

function KpiStrip({ d }: { d: SpvSummary }) {
  const casePct = d.sisa > 0 ? round1((d.caseData.nom / d.sisa) * 100) : 0;
  const janjiPct = d.target > 0 ? round1((d.forecast / d.target) * 100) : 0;
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Kpi label="Total Target" value={rupiah(d.target)} sub={`${d.invTotal} invoice`} />
      <Kpi label="Sudah Terkumpul" value={rupiah(d.terkumpul)} sub={`${d.invLunas} lunas`} />
      <Kpi label="Sisa Outstanding" value={rupiah(d.sisa)} sub={`${d.invBelum} belum lunas`} />
      <Kpi label="Case" value={rupiah(d.caseData.nom)} sub={`${d.caseData.count} inv case`} badge={`${casePct}%`} />
      <Kpi label="Janji Bayar" value={rupiah(d.forecast)} sub={`${d.forecastCount} invoice`} badge={`${janjiPct}% dari target`} />
    </div>
  );
}

function DonutCard({ title, d, kind }: { title: string; d: SpvSummary; kind: "pencapaian" | "forecast" }) {
  const pct = d.pencapaian;
  const fPct = d.target > 0 ? (d.forecast / d.target) * 100 : 0;
  const values = kind === "pencapaian"
    ? [{ value: Math.min(100, pct), color: pctColor(pct) }, { value: Math.max(0, 100 - pct), color: "#3c4043" }]
    : [
        { value: pct, color: "#1f9d6b" },
        { value: fPct, color: "#7fd0c2" },
        { value: Math.max(0, 100 - pct - fPct), color: "#3c4043" },
      ];
  const center = kind === "pencapaian" ? Math.round(pct) : Math.round(pct + fPct);

  const option: EChartsOption = {
    tooltip: { show: false },
    title: {
      text: `${center}%`,
      subtext: kind === "pencapaian" ? "PENCAPAIAN" : "TERKUMPUL + JANJI",
      left: "center",
      top: "center",
      itemGap: 4,
      textStyle: { fontSize: 20, fontWeight: 700, color: kind === "pencapaian" ? pctColor(pct) : "#8ab4f8" },
      subtextStyle: { fontSize: 11 },
    },
    series: [{
      type: "pie",
      radius: ["58%", "78%"],
      center: ["50%", "50%"],
      silent: true,
      label: { show: false },
      data: values.map((v) => ({ value: v.value, itemStyle: { color: v.color } })),
    }],
  };

  return (
    <div className={`${card} p-4`}>
      <h2 className="text-sm font-medium">{title}</h2>
      <Chart option={option} height={220} />
      {d.target === 0 && <p className="text-center text-xs text-fg-2">Target bulan ini belum ada.</p>}
    </div>
  );
}

function AgingCard({ d }: { d: SpvSummary }) {
  const buckets = AGING_BUCKETS.map((b) => d.agData[b] ?? { count: 0, nominal: 0 });
  const total = buckets.reduce((s, b) => s + Number(b.nominal), 0);
  const pct = (n: number) => (total > 0 ? round1((n / total) * 100) : 0);

  const option: EChartsOption = {
    grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "item",
      formatter: (p) => {
        const i = (p as { dataIndex: number }).dataIndex;
        return `${AGING_BUCKETS[i]}<br/>${rupiah(buckets[i].nominal)}<br/>${buckets[i].count} invoice (${pct(Number(buckets[i].nominal))}%)`;
      },
    },
    xAxis: { type: "category", data: [...AGING_BUCKETS], axisLabel: { fontSize: 10 } },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: CHART_GRID } },
      axisLabel: { formatter: (v: number) => (v >= 1e9 ? `${round1(v / 1e9)} M` : v >= 1e6 ? `${Math.round(v / 1e6)} jt` : String(v)) },
    },
    series: [{
      type: "bar",
      barMaxWidth: 70,
      data: buckets.map((b, i) => ({ value: Number(b.nominal), itemStyle: { color: AGING_COLOR[i], borderRadius: [6, 6, 0, 0] } })),
      label: { show: true, position: "top", formatter: (p) => `${pct(Number((p as { value: number }).value))}%` },
    }],
  };

  return (
    <div className={`${card} p-4`}>
      <h2 className="text-sm font-medium">Aging Sisa Tagihan</h2>
      <Chart option={option} height={200} />
      <ul className="mt-2 space-y-1 text-xs">
        {AGING_BUCKETS.map((b, i) => (
          <li key={b} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: AGING_COLOR[i] }} />
            <span className="flex-1">{b}</span>
            <span>{rupiah(buckets[i].nominal)}</span>
            <span className="w-14 text-right text-fg-2">{buckets[i].count} inv</span>
            <span className="w-12 text-right text-fg-2">{pct(Number(buckets[i].nominal))}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TopOverdue({ d }: { d: SpvSummary }) {
  const [market, setMarket] = useState("");
  const rows = market ? d.topOverdueByMarket[market] ?? [] : d.topOverdue;
  return (
    <section className={`${card} overflow-hidden`}>
      <div className="flex items-center gap-2 px-4 pt-4">
        <h2 className="text-sm font-medium">10 BP · Jatuh Tempo Terlama</h2>
        <select value={market} onChange={(e) => setMarket(e.target.value)} className={`${inputCls} ml-auto !w-auto !py-1 text-xs`}>
          <option value="">Global (Semua)</option>
          {d.marketingList.map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr><th className={th}>Business Partner</th><th className={`${th} text-right`}>Jml Inv</th><th className={`${th} text-right`}>Aging Terlama</th><th className={`${th} text-right`}>Total</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.bp} className="border-t border-line">
              <td className={`${td} max-w-64 truncate`} title={r.bp}>{r.bp}</td>
              <td className={`${td} text-right`}>{r.count}</td>
              <td className={`${td} text-right ${r.maxDays !== null && r.maxDays > 60 ? "font-medium text-danger" : r.maxDays !== null && r.maxDays > 30 ? "text-warning" : ""}`}>
                {r.maxDays === null ? "—" : r.maxDays <= 0 ? "Belum JT" : `${r.maxDays} hari`}
              </td>
              <td className={`${td} text-right`}>{rupiah(r.total)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td className={`${td} text-fg-2`} colSpan={4}>Tidak ada invoice terbuka.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

const TABS = [
  { key: "byMarket", label: "Per Marketing" },
  { key: "byBranch", label: "Per Branch" },
  { key: "byColl", label: "Per Collection" },
] as const;

function Breakdown({ d }: { d: SpvSummary }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("byMarket");
  const rows: GroupRow[] = d[tab];
  return (
    <section className={`${card} mt-4 overflow-hidden`}>
      <div className="flex items-center gap-2 px-4 pt-4">
        <h2 className="text-sm font-medium">Rincian Pencapaian</h2>
        <div className="ml-auto flex gap-1">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`rounded-full px-3 py-1 text-xs ${tab === t.key ? "bg-pill text-pill-fg" : "hover:bg-surface-2"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr>
              <th className={th}>Nama</th><th className={`${th} text-right`}>Lunas/Total</th>
              <th className={`${th} text-right`}>Terkumpul</th><th className={`${th} text-right`}>Sisa</th>
              <th className={`${th} text-right`}>Janji Bayar</th><th className={`${th} w-48`}>Pencapaian</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.nama} className="border-t border-line">
                <td className={td}>{r.nama}</td>
                <td className={`${td} text-right`}><span className="text-success">{r.invLunas}</span>/{r.invTotal}</td>
                <td className={`${td} text-right`}>{rupiah(r.terkumpul)}</td>
                <td className={`${td} text-right text-danger`}>{rupiah(r.sisa)}</td>
                <td className={`${td} text-right`}>{r.janjiCount ? <>{rupiah(r.janjiNom)} <span className="text-xs text-fg-2">{r.janjiCount} inv</span></> : "—"}</td>
                <td className={td}>
                  <div className="flex items-center gap-2">
                    <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.pencapaian)}%`, background: pctColor(r.pencapaian) }} />
                    </div>
                    <span className="w-12 text-right text-xs">{r.pencapaian}%</span>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className={`${td} text-fg-2`} colSpan={6}>Belum ada data.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const juta = (n: number | null) => (n === null ? null : Math.round(n / 1e4) / 100);

// Pengganti "Janji Bayar per tanggal": pergerakan Alokasi Target per tanggal (data Mutasi vs Realisasi).
function AllocationCard({ a }: { a: ReturnType<typeof allocationSeries> | null }) {
  if (!a) return <section className={`${card} p-4 text-sm text-fg-2`}>Memuat data alokasi…</section>;
  const option: EChartsOption = {
    grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", valueFormatter: (x) => (x == null ? "-" : `${Number(x).toLocaleString("id-ID")} jt`) },
    legend: { top: 0, textStyle: { color: "#9aa0a6" } },
    xAxis: { type: "category", data: a.days.map((d) => String(Number(d.date.slice(8)))) },
    yAxis: { type: "value", name: "Juta", splitLine: { lineStyle: { color: CHART_GRID } } },
    series: [
      { name: "Alloc in Target / hari", type: "bar", data: a.days.map((d) => juta(d.allocT)), itemStyle: { color: "#5f8fd8" }, barMaxWidth: 14 },
      { name: "Kumulatif Alloc in Target", type: "line", symbolSize: 4, data: a.days.map((d) => juta(d.cumAllocT)), itemStyle: { color: "#81c995" }, lineStyle: { width: 3 } },
      { name: "Kumulatif Allocated", type: "line", symbolSize: 3, data: a.days.map((d) => juta(d.cumAlloc)), itemStyle: { color: "#fdd663" }, lineStyle: { type: "dashed" } },
      { name: "Target", type: "line", symbol: "none", data: a.days.map(() => juta(a.target)), itemStyle: { color: "#f28b82" }, lineStyle: { type: "dotted" } },
    ],
  };
  return (
    <section className={`${card} p-4`}>
      <h2 className="text-sm font-medium">Alokasi Target · per Tanggal</h2>
      <p className="text-xs text-fg-2">Allocated in Target {rupiah(a.totalAllocT)} dari target {rupiah(a.target)} ({a.target ? round1((a.totalAllocT / a.target) * 100) : 0}%)</p>
      <Chart option={option} height={300} />
    </section>
  );
}

// Rekonsiliasi Terkumpul (target − sisa aging) vs Allocated in Target (pembayaran ERP) + penyebab selisih.
function ReconCard({ r }: { r: ReturnType<typeof reconcileCollected> }) {
  const [spec, setSpec] = useState<TableSpec | null>(null);
  return (
    <section className={`${card} mt-4 overflow-hidden`}>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-4 pt-4">
        <h2 className="text-sm font-medium">Rekonsiliasi Terkumpul vs Allocated in Target</h2>
        <span className="text-xs text-fg-2">Terkumpul <b className="text-fg">{rupiah(r.terkumpul)}</b></span>
        <span className="text-xs text-fg-2">Allocated in Target <b className="text-fg">{rupiah(r.allocT)}</b></span>
        <span className="text-xs text-fg-2">Selisih <b className={Math.abs(r.selisih) >= 1 ? "text-warning" : "text-success"}>{rupiah(r.selisih)}</b></span>
      </div>
      <table className="mt-2 w-full text-sm">
        <thead><tr><th className={th}>Kemungkinan penyebab</th><th className={`${th} text-right`}>Invoice</th><th className={`${th} text-right`}>Selisih</th></tr></thead>
        <tbody>
          {r.categories.map((c) => (
            <tr key={c.category} className="cursor-pointer border-t border-line hover:bg-surface-2"
              onClick={() => setSpec({
                title: c.label,
                cols: [
                  { k: "invoice_no", l: "Invoice" }, { k: "pengganti", l: "Invoice Pengganti" }, { k: "no_sj", l: "No SJ" },
                  { k: "business_partner", l: "Business Partner" },
                  { k: "target", l: "Target", n: true }, { k: "sisa", l: "Sisa Aging", n: true },
                  { k: "terkumpul", l: "Terkumpul", n: true }, { k: "dibayar", l: "Dibayar (bulan ini)", n: true },
                  { k: "dibayarLain", l: "Dibayar (bulan lain)", n: true }, { k: "selisih", l: "Selisih", n: true },
                ],
                rows: c.rows,
              })}>
              <td className={td}>{c.label}</td>
              <td className={`${td} text-right`}>{c.count.toLocaleString("id-ID")}</td>
              <td className={`${td} text-right`}>{rupiah(c.selisih)}</td>
            </tr>
          ))}
          {!r.categories.length && <tr><td className={`${td} text-fg-2`} colSpan={3}>Tidak ada selisih.</td></tr>}
        </tbody>
      </table>
      <DataTableModal spec={spec} onClose={() => setSpec(null)} />
    </section>
  );
}

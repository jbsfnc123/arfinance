"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { useCollectionPeriod } from "./use-period";
import { ClosingControls } from "./closing-controls";
import { closingReport } from "@/lib/modules/collection/closing";
import { LocalTable, type LCol } from "@/lib/local/table";
import { todayJakarta } from "@/lib/parsers/date";
import { fmtTimestamp, monthLabel, rupiah } from "@/lib/format";
import { AGING_BUCKETS } from "@/lib/modules/collection/aging";
import { bpOutstanding, round1, type BpOutMode, type BpOutRow, type GroupRow, type SpvSummary } from "@/lib/modules/collection/spv-summary";
import { Chart } from "@/components/chart";
import { agingColors, chartTheme, pctColor, seriesColors } from "@/lib/ui/palette";
import { useResolvedTheme } from "@/lib/ui/prefs";
import { btnGhost, card, cardTitle, chip, emptyTd, inputCls, tableCls, td, th } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { Skeleton, SkeletonChart } from "@/components/skeleton";
import { useViewState } from "@/lib/ui/view-state";
import { Icon } from "@/components/icons";

// Periode Open membaca sumber terikat; Closed memakai snapshot dan evaluator versi 1.
export function DashboardView() {
  const [picked, setMonth] = useViewState<string | null>("dash-coll:month", null);
  const current = todayJakarta().slice(0, 7);
  const month = picked ?? current;
  const period = useCollectionPeriod(month);
  const months = period.data?.months ?? [month];
  const report = useMemo(() => period.data ? closingReport(period.data.source) : null, [period.data]);
  const data = report?.data ?? null;
  const loading = period.loading;
  const reload = () => { void period.reload(); };
  const noData = !data && !loading;

  return (
    <div className="mx-auto max-w-[1920px]">
      <header className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="mr-auto">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Dashboard Collection</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} !w-auto !rounded-[10px] !py-1.5`} aria-label="Bulan target">
            {(months.includes(month) ? months : [month, ...months]).map((m) => (
              <option key={m} value={m}>Target {monthLabel(m)}</option>
            ))}
          </select>
          <span className="flex items-center gap-1 px-1 text-xs text-fg-2">
            <Icon name="cloud_done" size={15} />Diperbarui {fmtTimestamp(data?.lastTagihanUpdate)}
          </span>
          <button type="button" className={`${btnGhost} !rounded-[10px]`} onClick={reload} disabled={loading}>
            <Icon name="refresh" size={16} className={`${loading ? "animate-spin" : ""}`} />Refresh
          </button>
        </div>
      </header>

      {period.data && !period.loading && <ClosingControls key={`${month}:${period.data.revision}:${period.data.status}`} period={period.data} onChange={period.reload} />}
      {period.error && <p role="alert" className="mt-4 text-sm text-danger">Gagal memuat periode: {period.error}</p>}

      {noData ? (
        <EmptyState icon="monitoring" title="Tidak ada data" />
      ) : !data ? (
        <DashboardSkeleton />
      ) : (
        <div className={`mt-4 space-y-4 ${loading ? "opacity-60 transition-opacity" : ""}`}>
          {data.invTotal === 0 && (
            <p className={`${card} p-4 text-sm text-warning`}>
              Belum ada target untuk {monthLabel(month)}.
            </p>
          )}
          <KpiStrip d={data} />
          <div className="grid grid-cols-12 gap-4">
            <DonutCard className="col-span-12 md:col-span-6 xl:col-span-4" title="Pencapaian" d={data} kind="pencapaian" />
            <DonutCard className="col-span-12 md:col-span-6 xl:col-span-4" title="Terkumpul + Jadwal Bayar" d={data} kind="forecast" />
            <AgingCard className="col-span-12 xl:col-span-4" d={data} />
            <BpOutstandingCard className="col-span-12" d={data} />
            <TopOverdue className="col-span-12 xl:col-span-5" d={data} />
            <Breakdown className="col-span-12 xl:col-span-7" d={data} />
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mt-4 space-y-4" aria-busy aria-label="Memuat dashboard">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => <div key={i} className={`${card} p-4`}><Skeleton className="h-3 w-24" /><Skeleton className="mt-3 h-6 w-40" /><Skeleton className="mt-2 h-3 w-20" /></div>)}
      </div>
      <div className="grid grid-cols-12 gap-4">
        <SkeletonChart className="col-span-12 xl:col-span-4" /><SkeletonChart className="col-span-12 xl:col-span-4" /><SkeletonChart className="col-span-12 xl:col-span-4" />
        <SkeletonChart className="col-span-12 xl:col-span-7" height={300} /><SkeletonChart className="col-span-12 xl:col-span-5" height={300} />
      </div>
    </div>
  );
}

// ── KPI ────────────────────────────────────────────────────────────────────────
type Tone = "neutral" | "success" | "warning" | "danger" | "accent";
const TONE: Record<Tone, string> = {
  neutral: "bg-fg-2/60", success: "bg-success", warning: "bg-warning", danger: "bg-danger", accent: "bg-accent",
};
function Kpi({ label, value, sub, badge, tone = "neutral" }: { label: string; value: string; sub: string; badge?: string; tone?: Tone }) {
  return (
    <div className={`${card} relative overflow-hidden p-4`}>
      <span aria-hidden className={`absolute left-4 top-[19px] h-2 w-2 rounded-full ${TONE[tone]}`} />
      <div className="flex items-center gap-2 pl-4 text-[11px] font-medium uppercase tracking-[0.06em] text-fg-2">
        {label}
        {badge && <span className={`${chip} bg-surface-2 text-fg`}>{badge}</span>}
      </div>
      <div className="mt-2 whitespace-nowrap text-xl font-semibold leading-tight tracking-tight tabular-nums 2xl:text-[24px]">{value}</div>
      <div className="mt-0.5 text-xs text-fg-2">{sub}</div>
    </div>
  );
}

function KpiStrip({ d }: { d: SpvSummary }) {
  const casePct = d.sisa > 0 ? round1((d.caseData.nom / d.sisa) * 100) : 0;
  const janjiPct = d.target > 0 ? round1((d.forecast / d.target) * 100) : 0;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Kpi label="Total Target" value={rupiah(d.target)} sub={`${d.invTotal} invoice`} />
      <Kpi label="Sudah Terkumpul" value={rupiah(d.terkumpul)} sub={`${d.invLunas} lunas`} tone="success" />
      <Kpi label="Sisa Outstanding" value={rupiah(d.sisa)} sub={`${d.invBelum} belum lunas`} tone="warning" />
      <Kpi label="Case" value={rupiah(d.caseData.nom)} sub={`${d.caseData.count} inv case`} badge={`${casePct}%`} tone="danger" />
      <Kpi label="Jadwal Bayar" value={rupiah(d.forecast)} sub={`${d.forecastCount} invoice`} badge={`${janjiPct}% dari target`} tone="accent" />
    </div>
  );
}

// ── Kartu chart ────────────────────────────────────────────────────────────────
function CardHead({ title, sub, right }: { title: string; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <h2 className={cardTitle}>{title}</h2>
        {sub && <p className="text-xs text-fg-2">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

function DonutCard({ title, d, kind, className }: { title: string; d: SpvSummary; kind: "pencapaian" | "forecast"; className?: string }) {
  const theme = useResolvedTheme();
  const t = chartTheme();
  const pct = d.pencapaian;
  const fPct = d.target > 0 ? (d.forecast / d.target) * 100 : 0;
  const S = seriesColors(theme);
  const values = kind === "pencapaian"
    ? [{ value: Math.min(100, pct), color: pctColor(pct, theme) }, { value: Math.max(0, 100 - pct), color: t.track }]
    : [
        { value: pct, color: S.collected },
        { value: fPct, color: S.promise },
        { value: Math.max(0, 100 - pct - fPct), color: t.track },
      ];
  const center = kind === "pencapaian" ? Math.round(pct) : Math.round(pct + fPct);
  const accent = kind === "pencapaian" ? pctColor(pct, theme) : S.accent;

  const option: EChartsOption = {
    tooltip: { show: false },
    series: [{
      type: "pie", radius: ["66%", "84%"], center: ["50%", "50%"], silent: true, label: { show: false },
      animationDuration: 500, animationEasing: "cubicOut",
      data: values.map((v) => ({ value: v.value, itemStyle: { color: v.color, borderRadius: 4, borderColor: t.surface, borderWidth: 2 } })),
    }],
  };
  const legend = kind === "pencapaian"
    ? [{ c: pctColor(pct, theme), l: "Terkumpul", v: rupiah(d.terkumpul) }, { c: t.track, l: "Sisa", v: rupiah(d.sisa) }]
    : [{ c: S.collected, l: "Terkumpul", v: `${round1(pct)}%` }, { c: S.promise, l: "Jadwal Bayar", v: `${round1(fPct)}%` }];
  return (
    <section className={`${card} p-4 ${className ?? ""}`}>
      <CardHead title={title} sub={kind === "pencapaian" ? `Target ${rupiah(d.target)}` : `${d.forecastCount} invoice punya jadwal bayar`} />
      <div className="relative">
        <Chart option={option} height={210} />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[32px] font-bold leading-none tabular-nums" style={{ color: accent }}>{center}%</span>
          <span className="mt-1 text-[11px] uppercase tracking-wide text-fg-2">{kind === "pencapaian" ? "Pencapaian" : "Terkumpul + Jadwal"}</span>
        </div>
      </div>
      <ul className="mt-1 space-y-1.5 text-xs">
        {legend.map((x) => (
          <li key={x.l} className="flex items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: x.c }} /><span className="text-fg-2">{x.l}</span><span className="ml-auto tabular-nums">{x.v}</span></li>
        ))}
      </ul>
      {d.target === 0 && <p className="mt-2 text-center text-xs text-fg-2">Target bulan ini belum ada.</p>}
    </section>
  );
}

function AgingCard({ d, className }: { d: SpvSummary; className?: string }) {
  const AG = agingColors(useResolvedTheme());
  const t = chartTheme();
  const buckets = AGING_BUCKETS.map((b) => d.agData[b] ?? { count: 0, nominal: 0 });
  const total = buckets.reduce((s, b) => s + Number(b.nominal), 0);
  const pct = (n: number) => (total > 0 ? round1((n / total) * 100) : 0);

  const option: EChartsOption = {
    grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "item",
      formatter: (p) => {
        const i = (p as { dataIndex: number }).dataIndex;
        return `<b>${AGING_BUCKETS[i]}</b><br/>${rupiah(buckets[i].nominal)}<br/>${buckets[i].count} invoice · ${pct(Number(buckets[i].nominal))}%`;
      },
    },
    xAxis: { type: "category", data: [...AGING_BUCKETS], axisLabel: { fontSize: 10, color: t.text }, axisLine: { lineStyle: { color: t.grid } } },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: t.grid } },
      axisLabel: { color: t.text, formatter: (v: number) => (v >= 1e9 ? `${round1(v / 1e9)} M` : v >= 1e6 ? `${Math.round(v / 1e6)} jt` : String(v)) },
    },
    series: [{
      type: "bar", barMaxWidth: 56, animationDuration: 500,
      data: buckets.map((b, i) => ({ value: Number(b.nominal), itemStyle: { color: AG[i], borderRadius: [6, 6, 0, 0] } })),
      label: { show: true, position: "top", distance: 4, color: t.label, fontSize: 11, textBorderWidth: 0, formatter: (p) => `${pct(Number((p as { value: number }).value))}%` },
    }],
  };

  return (
    <section className={`${card} p-4 ${className ?? ""}`}>
      <CardHead title="Aging Sisa Tagihan" sub={`Sisa ${rupiah(total)} · ${buckets.reduce((s, b) => s + b.count, 0)} invoice`} />
      <Chart option={option} height={190} />
      <ul className="mt-2 space-y-1.5 text-xs">
        {AGING_BUCKETS.map((b, i) => (
          <li key={b} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: AG[i] }} />
            <span className="flex-1 text-fg-2">{b}</span>
            <span className="tabular-nums">{rupiah(buckets[i].nominal)}</span>
            <span className="w-14 text-right tabular-nums text-fg-2">{buckets[i].count} inv</span>
            <span className="w-12 text-right tabular-nums text-fg-2">{pct(Number(buckets[i].nominal))}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const agingChip = (days: number | null) =>
  days === null ? `${chip} bg-surface-2 text-fg-2`
    : days > 60 ? `${chip} bg-danger/15 text-danger`
    : days > 30 ? `${chip} bg-warning/15 text-warning`
    : days > 0 ? `${chip} bg-warning/10 text-warning`
    : `${chip} bg-success/15 text-success`;

function TopOverdue({ d, className }: { d: SpvSummary; className?: string }) {
  const [market, setMarket] = useViewState("dash-coll:market", "");
  const rows = market ? d.topOverdueByMarket[market] ?? [] : d.topOverdue;
  return (
    <section className={`${card} flex flex-col overflow-hidden ${className ?? ""}`}>
      <div className="px-4 pt-4">
        <CardHead title="10 BP · Jatuh Tempo Terlama"
          right={
            <select value={market} onChange={(e) => setMarket(e.target.value)} className={`${inputCls} !w-auto !py-1 text-xs`} aria-label="Marketing">
              <option value="">Global (Semua)</option>
              {d.marketingList.map((m) => <option key={m}>{m}</option>)}
            </select>
          } />
      </div>
      <div className="mt-2 min-h-0 flex-1 overflow-auto">
        <table className={tableCls}>
          <thead>
            <tr><th className={th}>Business Partner</th><th className={`${th} text-right`}>Jml Inv</th><th className={`${th} text-right`}>Aging Terlama</th><th className={`${th} text-right`}>Total</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.bp}>
                <td className={`${td} max-w-64 truncate`} title={r.bp}>{r.bp}</td>
                <td className={`${td} text-right tabular-nums`}>{r.count}</td>
                <td className={`${td} text-right`}>
                  <span className={agingChip(r.maxDays)}>{r.maxDays === null ? "—" : r.maxDays <= 0 ? "Belum JT" : `${r.maxDays} hari`}</span>
                </td>
                <td className={`${td} text-right tabular-nums`}>{rupiah(r.total)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className={emptyTd} colSpan={4}>Tidak ada invoice terbuka.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const TABS = [
  { key: "byMarket", label: "Per Marketing" },
  { key: "byBranch", label: "Per Branch" },
  { key: "byColl", label: "Per Collection" },
] as const;

function Breakdown({ d, className }: { d: SpvSummary; className?: string }) {
  const theme = useResolvedTheme();
  const [tab, setTab] = useViewState<(typeof TABS)[number]["key"]>("dash-coll:tab", "byMarket");
  const rows: GroupRow[] = d[tab];
  return (
    <section className={`${card} overflow-hidden ${className ?? ""}`}>
      <div className="px-4 pt-4">
        <CardHead title="Rincian Pencapaian"
          right={
            <div className="flex gap-0.5 rounded-[10px] bg-fill-3 p-[3px]">
              {TABS.map((t) => (
                <button key={t.key} type="button" onClick={() => setTab(t.key)} aria-pressed={tab === t.key}
                  className={`rounded-[8px] px-3 py-1 text-xs transition-colors ${tab === t.key ? "bg-surface font-medium text-fg shadow-sm" : "text-fg-2 hover:text-fg"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          } />
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className={tableCls}>
          <thead>
            <tr>
              <th className={th}>Nama</th><th className={`${th} text-right`}>Lunas/Total</th>
              <th className={`${th} text-right`}>Terkumpul</th><th className={`${th} text-right`}>Sisa</th>
              <th className={`${th} text-right`}>Jadwal Bayar</th><th className={`${th} w-48`}>Pencapaian</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.nama}>
                <td className={td}>{r.nama}</td>
                <td className={`${td} text-right tabular-nums`}><span className="text-success">{r.invLunas}</span><span className="text-fg-2">/{r.invTotal}</span></td>
                <td className={`${td} text-right tabular-nums`}>{rupiah(r.terkumpul)}</td>
                <td className={`${td} text-right tabular-nums text-danger`}>{rupiah(r.sisa)}</td>
                <td className={`${td} text-right tabular-nums`}>{r.janjiCount ? <>{rupiah(r.janjiNom)} <span className="text-xs text-fg-2">{r.janjiCount} inv</span></> : "—"}</td>
                <td className={td}>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.pencapaian)}%`, background: pctColor(r.pencapaian, theme) }} />
                    </div>
                    <span className="w-12 text-right text-xs tabular-nums">{r.pencapaian}%</span>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className={emptyTd} colSpan={6}>Belum ada data.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const BP_MODES: { k: BpOutMode; l: string }[] = [{ k: "all", l: "All" }, { k: "overdue", l: "Overdue" }, { k: "not", l: "Not Overdue" }];
const BP_COLS: LCol<BpOutRow>[] = [
  { k: "bp", l: "Business Partner", w: 240 },
  { k: "marketing", l: "Marketing" },
  { k: "collection", l: "Collection" },
  { k: "count", l: "Jml Inv", n: true, sum: true },
  { k: "outstanding", l: "Outstanding (Rp)", n: true, sum: true },
  { k: "overdue", l: "Overdue (Rp)", n: true, sum: true },
  { k: "notOverdue", l: "Not Overdue (Rp)", n: true, sum: true },
];
const BP_SORT: Record<BpOutMode, keyof BpOutRow & string> = { all: "outstanding", overdue: "overdue", not: "notOverdue" };

// Fase 89: Business Partner yang masih outstanding (invoice target bulan terpilih) — filter All/Overdue/Not Overdue,
// Marketing & Collection; urutan bawaan = nilai sesuai mode, terbesar dulu.
function BpOutstandingCard({ d, className }: { d: SpvSummary; className?: string }) {
  const [mode, setMode] = useViewState<BpOutMode>("dash-coll:bp-mode", "all");
  const [mkt, setMkt] = useViewState("dash-coll:bp-mkt", "");
  const [coll, setColl] = useViewState("dash-coll:bp-coll", "");
  const out = useMemo(() => bpOutstanding(d.openInvoices ?? [], { mode, mkt, coll }), [d.openInvoices, mode, mkt, coll]);
  const tot = out.rows.reduce((t, r) => t + r.outstanding, 0);
  return (
    <section className={className} aria-labelledby="bp-out-title">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
        <h2 id="bp-out-title" className={cardTitle}>Business Partner Outstanding</h2>
        <span className="text-xs text-fg-2">{out.rows.length.toLocaleString("id-ID")} BP · outstanding {rupiah(tot)} · invoice target {monthLabel(d.month)} yang belum lunas</span>
      </div>
      <LocalTable title="Business Partner Outstanding" stateKey={`dash-coll-bp-${mode}`} rows={out.rows} cols={BP_COLS} rowKey={(r) => r.bp}
        defaultSort={{ k: BP_SORT[mode], dir: -1 }} search={["bp", "marketing", "collection"]} fill={false} maxHeight="max-h-[60vh]"
        emptyText="Tidak ada Business Partner outstanding."
        toolbar={(
          <span className="flex flex-wrap items-center gap-2">
            <span className="flex gap-0.5 rounded-[10px] bg-fill-3 p-[3px]" role="group" aria-label="Status jatuh tempo">
              {BP_MODES.map((m) => (
                <button key={m.k} type="button" onClick={() => setMode(m.k)} aria-pressed={mode === m.k}
                  className={`rounded-[8px] px-3 py-1 text-xs transition-colors ${mode === m.k ? "bg-surface font-medium text-fg shadow-sm" : "text-fg-2 hover:text-fg"}`}>
                  {m.l}
                </button>
              ))}
            </span>
            <select value={mkt} onChange={(e) => setMkt(e.target.value)} className={`${inputCls} !w-auto !py-1 text-xs`} aria-label="Filter Marketing">
              <option value="">Marketing: semua</option>
              {out.marketingList.map((m) => <option key={m}>{m}</option>)}
            </select>
            <select value={coll} onChange={(e) => setColl(e.target.value)} className={`${inputCls} !w-auto !py-1 text-xs`} aria-label="Filter Collection">
              <option value="">Collection: semua</option>
              {out.collectionList.map((c) => <option key={c}>{c}</option>)}
            </select>
          </span>
        )} />
    </section>
  );
}

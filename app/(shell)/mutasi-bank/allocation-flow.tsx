"use client";

import { Icon } from "@/components/icons";
import { card } from "@/components/ui";
import { monthLabel, rupiah } from "@/lib/format";
import { pctOf, rpShort, type Allocation } from "@/lib/modules/mutasi/allocation";

// "Ke mana uang masuk dialokasikan?" (Fase 50): KPI, diagram alur uang masuk → 4 pos tidak tumpang tindih, dan progres
// alokasi ke penjualan & target. Warna hanya dari token tema (terang/gelap ikut otomatis).

const tint = (v: string, p: number) => `color-mix(in srgb, var(${v}) ${p}%, transparent)`;
const pct1 = (v: number) => `${v.toLocaleString("id-ID", { maximumFractionDigits: v > 0 && v < 1 ? 1 : 0 })}%`;
const nextMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
};
const bulan = (ym: string) => monthLabel(ym).split(" ")[0];

const ROW_H = 60, GAP = 10;

export function AllocationFlow({ a }: { a: Allocation }) {
  const M = bulan(a.month), N = bulan(nextMonth(a.month));
  const posts = [
    { key: "sales", label: `Alokasi penjualan ${M}`, sub: `Untuk penjualan selama ${M}`, value: a.allocSales, color: "--color-accent" },
    { key: "target", label: `Alokasi target ${M}`, sub: `Untuk tagihan dalam target ${M}`, value: a.allocTarget, color: "--color-success" },
    { key: "other", label: "Di luar penjualan & target", sub: "Sudah dialokasikan ke tagihan lain", value: a.allocOther, color: "--color-fg-2" },
    { key: "open", label: "Belum dialokasikan", sub: `Uang masuk ${M} yang belum dipasangkan`, value: a.unallocated, color: "--color-warning" },
  ];
  const allocatedShown = a.allocTotal - a.over; // bagian uang masuk yang teralokasi
  const empty = a.base === 0;

  return (
    <div className="space-y-4" aria-label={`Alokasi uang masuk ${monthLabel(a.month)}`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon="monitoring" color="--color-accent" label={`Penjualan ${M}`} value={a.sales} />
        <Kpi icon="account_balance" color="--color-success" label={`Uang masuk ${M}`} value={a.inflow} />
        <Kpi icon="target" color="--color-accent-strong" label={`Target tagihan ${M}`} value={a.target} />
        <Kpi icon="history" color="--color-danger" label={`Outstanding ${N}`} value={a.outstanding} danger
          sub={`${rpShort(a.sales)} penjualan − ${rpShort(a.allocSales)} alokasi`} />
      </div>

      <section className={`${card} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="text-[15px] font-semibold tracking-tight">Ke mana uang masuk dialokasikan?</h2>
          {!empty && (
            <span className="ml-auto text-xs text-fg-2 tabular-nums">
              Teralokasi <b className="text-fg" title={rupiah(allocatedShown)}>{rpShort(allocatedShown)}</b> ({pct1(pctOf(allocatedShown, a.inflow))})
              <span className="mx-2 text-line-strong">|</span>
              Belum <b className="text-fg" title={rupiah(a.unallocated)}>{rpShort(a.unallocated)}</b> ({pct1(pctOf(a.unallocated, a.inflow))})
            </span>
          )}
        </div>
        {empty ? (
          <p className="py-10 text-center text-sm text-fg-2">Belum ada uang masuk maupun pembayaran pada {monthLabel(a.month)}.</p>
        ) : (
          <div className="mt-4 grid items-center gap-3 sm:grid-cols-[minmax(150px,200px)_1fr_minmax(260px,400px)] sm:gap-0">
            <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border p-4 text-center sm:h-[220px]"
              style={{ background: tint("--color-success", 10), borderColor: tint("--color-success", 30) }}>
              <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: tint("--color-success", 18), color: "var(--color-success)" }}>
                <Icon name="payments" size={20} />
              </span>
              <span className="mt-1 text-sm font-medium">Uang masuk</span>
              <span className="text-[28px] font-semibold leading-tight tabular-nums" title={rupiah(a.inflow)}>{rpShort(a.inflow)}</span>
              <span className="text-xs text-fg-2">100%</span>
            </div>
            <Ribbons posts={posts} base={a.base} />
            <ul className="space-y-[10px]">
              {posts.map((p) => (
                <li key={p.key} className="flex items-center gap-3 rounded-xl px-3" style={{ height: ROW_H, background: tint(p.color, 9) }}>
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: `var(${p.color})` }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{p.label}</span>
                    <span className="block truncate text-[11px] text-fg-2">{p.sub}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[15px] font-semibold tabular-nums" title={rupiah(p.value)}>{rpShort(p.value)}</span>
                    <span className="block text-[11px] text-fg-2 tabular-nums">{pct1(pctOf(p.value, a.base))}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {a.over > 0 && <p className="mt-4 text-xs"><b className="text-warning">Pembayaran ERP melebihi uang masuk sebesar {rpShort(a.over)} — persen dihitung dari total pembayaran.</b></p>}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Progress title={`Alokasi ke penjualan ${M}`} done={a.allocSales} total={a.sales} color="--color-accent" rest="--color-danger"
          doneLabel="Teralokasi" restLabel="Sisa penjualan" footer={`Outstanding ${N}`} badge="teralokasi" />
        <Progress title={`Alokasi ke target ${M}`} done={a.allocTarget} total={a.target} color="--color-success" rest="--color-fg-2"
          doneLabel="Teralokasi" restLabel="Sisa target" footer="Sisa target" badge="tercapai" />
      </div>
    </div>
  );
}

function Kpi({ icon, color, label, value, sub, danger }: { icon: string; color: string; label: string; value: number; sub?: string; danger?: boolean }) {
  return (
    <div className={`${card} flex gap-3 p-4`} style={danger ? { background: tint("--color-danger", 7), borderColor: tint("--color-danger", 25) } : undefined}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: tint(color, 14), color: `var(${color})` }}>
        <Icon name={icon} size={20} />
      </span>
      <div className="min-w-0">
        <div className={`text-[13px] font-medium ${danger ? "text-danger" : ""}`}>{label}</div>
        <div className="text-[26px] font-semibold leading-tight tracking-tight tabular-nums" title={rupiah(value)}>{rpShort(value)}</div>
        <div className="truncate text-[11px] text-fg-2" title={sub}>{sub}</div>
      </div>
    </div>
  );
}

/** Pita lengkung dari blok uang masuk (kiri, ditumpuk proporsional) ke tiap pos (kanan, tengah kartu). */
function Ribbons({ posts, base }: { posts: { key: string; value: number; color: string; label: string }[]; base: number }) {
  const H = posts.length * ROW_H + (posts.length - 1) * GAP;
  const srcTop = (H - 220) / 2, srcH = 220, maxT = ROW_H - 16;
  const shares = posts.map((p) => (base > 0 ? p.value / base : 0));
  const starts = shares.map((_, i) => srcTop + shares.slice(0, i).reduce((x, y) => x + y, 0) * srcH);
  const paths = posts.map((p, i) => {
    const y0 = starts[i], t0 = shares[i] * srcH;
    const t1 = p.value > 0 ? Math.min(maxT, Math.max(3, shares[i] * maxT * 1.6)) : 0; // tebal di sisi kartu
    const c1 = i * (ROW_H + GAP) + ROW_H / 2 - t1 / 2;
    const d = `M0,${y0} C50,${y0} 50,${c1} 100,${c1} L100,${c1 + t1} C50,${c1 + t1} 50,${y0 + t0} 0,${y0 + t0} Z`;
    return { key: p.key, d, color: p.color, show: p.value > 0 };
  });
  return (
    <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="hidden h-[270px] w-full sm:block" role="img"
      aria-label={`Alur uang masuk: ${posts.map((p) => `${p.label} ${Math.round(pctOf(p.value, base))}%`).join(", ")}`}>
      {paths.filter((p) => p.show).map((p) => (
        <path key={p.key} d={p.d} style={{ fill: tint(p.color, 32) }} />
      ))}
    </svg>
  );
}

function Progress(props: { title: string; done: number; total: number; color: string; rest: string; doneLabel: string; restLabel: string; footer: string; badge: string }) {
  const left = Math.max(0, props.total - props.done);
  const p = pctOf(props.done, props.total), clamped = Math.min(100, p);
  return (
    <section className={`${card} p-4 sm:p-5`}>
      <h3 className="text-[15px] font-semibold tracking-tight">{props.title}</h3>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="text-[26px] font-semibold tabular-nums tracking-tight">
          <span title={rupiah(props.done)}>{rpShort(props.done)}</span>
          <span className="text-fg-2"> / </span>
          <span className="text-xl" title={rupiah(props.total)}>{rpShort(props.total)}</span>
        </span>
        <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: tint(props.color, 14), color: `var(${props.color})` }}>
          {pct1(p)} {props.badge}
        </span>
      </div>
      <div className="mt-3 flex h-6 overflow-hidden rounded-lg text-[11px] font-medium tabular-nums" role="img"
        aria-label={`${props.doneLabel} ${rpShort(props.done)} (${pct1(p)}), ${props.restLabel} ${rpShort(left)}`}>
        {clamped > 0 && <div className="flex items-center justify-center text-white" style={{ width: `${clamped}%`, background: `var(${props.color})` }}>{clamped >= 12 ? rpShort(props.done) : ""}</div>}
        {clamped < 100 && <div className="flex flex-1 items-center justify-center" style={{ background: tint(props.rest, 22) }}>{100 - clamped >= 12 ? rpShort(left) : ""}</div>}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-fg-2 tabular-nums">
        <span style={{ width: `${Math.max(clamped, 12)}%` }} className="text-center">{pct1(clamped)}</span>
        <span className="flex-1 text-center">{pct1(100 - clamped)}</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: `var(${props.color})` }} aria-hidden />
          <dt className="text-fg-2">{props.doneLabel}</dt><dd className="ml-auto font-semibold tabular-nums" title={rupiah(props.done)}>{rpShort(props.done)}</dd></div>
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: tint(props.rest, 45) }} aria-hidden />
          <dt className="text-fg-2">{props.restLabel}</dt><dd className="ml-auto font-semibold tabular-nums" title={rupiah(left)}>{rpShort(left)}</dd></div>
      </dl>
      <div className="mt-3 border-t border-hairline pt-3 text-[15px] font-semibold">
        {props.footer}: <span className="tabular-nums" title={rupiah(left)}>{rpShort(left)}</span>
      </div>
    </section>
  );
}

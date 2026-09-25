import { daysBetween } from "@/lib/parsers/date";
import { num } from "@/lib/local/pack";
import type { AgingLine, Gr, Kwitansi, Schedule, Worksheet } from "@/lib/local/datasets";

// Rumus workbook "VBA Mitra10 Tukar Faktur.xlsm" dihitung di browser (dulu view SQL yang
// timeout). Semua lookup memakai Map → O(n) untuk ribuan baris.

export const TAX_DEFAULT = "Catur Mitra Sejati Sentosa";
const up = (s: string | null | undefined) => (s ?? "").toUpperCase();
const avg1 = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

// Username portal = 8 karakter paling kanan Payment Group ("… Pengu683" → "Pengu683").
export const usernameOf = (paymentGroup: string | null | undefined) => {
  const s = (paymentGroup ?? "").trim();
  return s ? s.slice(-8) : "kosong";
};

export type WorksheetRow = Worksheet & {
  username: string; gr: "Done" | "Pending"; tukar_faktur: "Done" | "Pending"; selisih: number;
  status: "Outstanding" | "Lunas"; jadwal_bayar: string | null; lama_tf: number | null;
};
export type GrRow = Gr & { po_aging: string; check_status: "Done" | "Check" };
export type KwRow = Kwitansi & { jadwal_bayar: string | null; aging: number; selisih: number };

export function m10AgingLines(lines: AgingLine[], taxName: string) {
  const t = taxName.trim().toLowerCase();
  return lines.filter((l) => (l.tax_name ?? "").trim().toLowerCase() === t);
}

export function computeM10(input: { worksheet: Worksheet[]; gr: Gr[]; kwitansi: Kwitansi[]; schedule: Schedule[]; aging: AgingLine[] }) {
  const aging = input.aging; // sudah difilter Tax Name
  const agingInv = new Map<string, number>();       // Invoice No → Open Amt (baris pertama)
  const agingSjPo = new Map<string, string | null>(); // No SJ → No PO (baris pertama)
  for (const a of [...aging].sort((x, y) => x.line_no - y.line_no)) {
    if (a.invoice_no && !agingInv.has(a.invoice_no)) agingInv.set(a.invoice_no, num(a.open_amt));
    if (a.no_sj && !agingSjPo.has(a.no_sj)) agingSjPo.set(a.no_sj, a.no_po);
  }
  const sched = new Map(input.schedule.map((s) => [s.no_kw, s.jadwal_transfer]));
  const grSj = new Set(input.gr.map((g) => g.sj_no).filter(Boolean) as string[]);
  const kwSum = new Map<string, number>();
  const kwFirst = new Map<string, Kwitansi>();
  for (const k of [...input.kwitansi].sort((a, b) => a.id - b.id)) {
    if (!k.vendor_invoice_no) continue;
    kwSum.set(k.vendor_invoice_no, (kwSum.get(k.vendor_invoice_no) ?? 0) + num(k.total_net));
    if (!kwFirst.has(k.vendor_invoice_no)) kwFirst.set(k.vendor_invoice_no, k);
  }

  const worksheet: WorksheetRow[] = input.worksheet.map((w) => {
    const total = w.invoice_no ? kwSum.get(w.invoice_no) ?? 0 : 0;
    const first = w.invoice_no ? kwFirst.get(w.invoice_no) : undefined;
    return {
      ...w,
      open_amt: num(w.open_amt),
      username: usernameOf(w.payment_group),
      gr: grSj.has(w.no_sj) ? "Done" : "Pending",
      tukar_faktur: total > 10000 ? "Done" : "Pending",
      selisih: num(w.open_amt) - total,
      status: w.invoice_no && agingInv.has(w.invoice_no) ? "Outstanding" : "Lunas",
      jadwal_bayar: first?.kuitansi_no ? sched.get(first.kuitansi_no) ?? null : null,
      lama_tf: first?.kuitansi_date && w.invoice_date ? daysBetween(first.kuitansi_date, w.invoice_date) : null,
    };
  });

  const gr: GrRow[] = input.gr.map((g) => {
    const po = g.sj_no && agingSjPo.has(g.sj_no) ? agingSjPo.get(g.sj_no) ?? null : null;
    const poAging = po ?? "Kosong";
    return { ...g, po_aging: poAging, check_status: up(g.po_no) === up(poAging) ? "Done" : "Check" };
  });

  const kwitansi: KwRow[] = input.kwitansi.map((k) => {
    const ag = k.vendor_invoice_no ? agingInv.get(k.vendor_invoice_no) ?? 0 : 0;
    return { ...k, total_net: num(k.total_net), jadwal_bayar: k.kuitansi_no ? sched.get(k.kuitansi_no) ?? null : null, aging: ag, selisih: num(k.total_net) - ag };
  });

  return { worksheet, gr, kwitansi };
}

// ── Dashboard (port m10_dashboard) ──────────────────────────────
export type Stat = { invoice: number; done: number; avgLama: number | null };
export type M10Dashboard = {
  month: string; months: string[]; prevMonth: string; curMonth: string;
  summary: Record<string, number>;
  grCheck: number; agingNotInWorksheet: number;
  aging: { count: number; totalOpen: number; buckets: { label: string; value: number }[]; avgDays: number };
  monthly: (Stat & { month: string })[];
  daily: (Stat & { date: string; jadwal: number })[];
  scheduleAvgDays: number | null; lastAging: string | null;
};

const addMonth = (ym: string, k: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + k, 1));
  return d.toISOString().slice(0, 7);
};

export function m10Dashboard(
  c: ReturnType<typeof computeM10>, aging: AgingLine[], schedule: Schedule[],
  opt: { month: string | null; today: string; lastAging: string | null },
): M10Dashboard {
  const w = c.worksheet;
  const months = [...new Set(w.map((r) => r.invoice_date?.slice(0, 7)).filter(Boolean) as string[])].sort();
  const month = opt.month && months.includes(opt.month) ? opt.month : months[months.length - 1] ?? opt.today.slice(0, 7);
  const cur = opt.today.slice(0, 7), prev = addMonth(cur, -1);
  const out = w.filter((r) => r.status === "Outstanding");
  const kt = (s: string | null) => (s ?? "").trim().toUpperCase();

  const wsSj = new Set(w.map((r) => up(r.no_sj)));
  const days = aging.map((a) => a.days).filter((d): d is number => d !== null && d !== undefined);
  const sum = (f: (a: AgingLine) => number) => aging.reduce((s, a) => s + num(f(a)), 0);
  const totalOpen = sum((a) => a.open_amt);

  const byMonth = new Map<string, WorksheetRow[]>();
  for (const r of w) if (r.invoice_date) {
    const m = r.invoice_date.slice(0, 7);
    (byMonth.get(m) ?? byMonth.set(m, []).get(m)!).push(r);
  }
  const stat = (rs: WorksheetRow[]): Stat => ({
    invoice: rs.length, done: rs.filter((r) => r.tukar_faktur === "Done").length,
    avgLama: avg1(rs.map((r) => r.lama_tf).filter((x): x is number => x !== null)),
  });

  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const daily = Array.from({ length: last }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, "0")}`;
    return { date, ...stat(w.filter((r) => r.invoice_date === date)),
      jadwal: w.filter((r) => r.jadwal_bayar === date).reduce((s, r) => s + r.open_amt, 0) };
  });

  const sched = schedule.filter((s) => s.jadwal_transfer && s.tgl_tukar_faktur)
    .map((s) => daysBetween(s.jadwal_transfer!, s.tgl_tukar_faktur!));

  return {
    month, months, prevMonth: prev, curMonth: cur,
    summary: {
      total: w.length,
      outstanding: out.length,
      openOutstanding: out.reduce((s, r) => s + r.open_amt, 0),
      lunas: w.length - out.length,
      grPending: out.filter((r) => r.gr === "Pending").length,
      siapTukar: out.filter((r) => r.gr === "Done" && r.tukar_faktur === "Pending").length,
      tfDone: w.filter((r) => r.tukar_faktur === "Done").length,
      selisihNonZero: w.filter((r) => r.tukar_faktur === "Done" && r.selisih !== 0).length,
      ltkp: w.filter((r) => kt(r.keterangan) === "LTKP").length,
      litigasi: w.filter((r) => kt(r.keterangan) === "LITIGASI").length,
      pendingPrev: w.filter((r) => r.tukar_faktur === "Pending" && r.invoice_date?.slice(0, 7) === prev).length,
      pendingCur: w.filter((r) => r.tukar_faktur === "Pending" && r.invoice_date?.slice(0, 7) === cur).length,
    },
    grCheck: c.gr.filter((g) => g.check_status === "Check").length,
    agingNotInWorksheet: aging.filter((a) => !wsSj.has(up(a.no_sj))).length,
    aging: {
      count: aging.filter((a) => a.invoice_no).length,
      totalOpen,
      buckets: [
        { label: "Current 0 - 30", value: sum((a) => a.cur_0_30) }, { label: "Current 31 - 60", value: sum((a) => a.cur_31_60) },
        { label: "Due + 1 - 7", value: sum((a) => a.due_1_7) }, { label: "Due + 8 - 30", value: sum((a) => a.due_8_30) },
        { label: "Due + 31 - 60", value: sum((a) => a.due_31_60) }, { label: "Due + 61 - 90", value: sum((a) => a.due_61_90) },
        { label: "Due + > 90", value: sum((a) => a.due_90) },
      ],
      avgDays: avg1(days) ?? 0,
    },
    monthly: [...byMonth.keys()].sort().map((mm) => ({ month: mm, ...stat(byMonth.get(mm)!) })),
    daily,
    scheduleAvgDays: avg1(sched),
    lastAging: opt.lastAging,
  };
}

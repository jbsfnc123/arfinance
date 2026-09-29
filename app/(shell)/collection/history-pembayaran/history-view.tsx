"use client";

import { useMemo, useState } from "react";
import { LocalTable, type LCol } from "@/lib/local/table";
import { OLD_DAYS, type HistoryRow } from "@/lib/modules/collection/payment-history";
import { useViewState } from "@/lib/ui/view-state";
import { fmtDate, monthLabel, rupiah } from "@/lib/format";
import { lamaCls, lamaTxt, PaymentHistoryModal, usePaymentHistory, type PayHistTarget } from "@/components/payment-history-modal";
import { Icon } from "@/components/icons";

const notOld = (r: HistoryRow) => !r.hasOld;
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));
const num = (n: number) => Math.round(n).toLocaleString("id-ID");

const lamaCol = (k: "avgLama" | "maxLama", l: string, bold = false): LCol<HistoryRow> => ({
  k, l, n: true, w: 100, render: (r) => (
    <span className="inline-flex items-center justify-end gap-1">
      {k === "maxLama" && r.hasOld && (
        <span className="rounded-full bg-danger/15 px-1.5 text-[10px] text-danger"
          title={`Ada invoice telat > ${OLD_DAYS} hari (mis. piutang lama yang di-clear) — tidak ikut daftar 20 teratas`}>&gt; {OLD_DAYS} hr</span>
      )}
      <span className={`${bold ? "font-medium " : ""}${lamaCls(r[k])}`}>{lamaTxt(r[k])}</span>
    </span>
  ),
});
const top3Col = (withBp: boolean): LCol<HistoryRow> => ({
  k: "top3Text", l: "3 Transaksi Terlama", w: 380,
  text: (r) => r.top3.map((t) => `${withBp ? `${t.bp}: ` : ""}${t.invoice_no} ${lamaTxt(t.lama)}`).join(" · "),
  render: (r) => (
    <span className="flex flex-wrap gap-1">
      {r.top3.map((t, i) => (
        <span key={i} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs"
          title={`${t.bp} · due ${fmtDate(t.due_date)} · bayar ${fmtDate(t.payment_date)} · ${rupiah(t.amount)}`}>
          {withBp && r.jenis === "Group" && <span className="text-fg-2">{t.bp.split(" - ").pop()} · </span>}
          {t.invoice_no} <b className={lamaCls(t.lama)}>{lamaTxt(t.lama)}</b>
        </span>
      ))}
    </span>
  ),
});
const moneyCols: LCol<HistoryRow>[] = [
  { k: "outstanding", l: "Sisa Outstanding", n: true, sum: true, w: 130 },
  { k: "overdue", l: "Overdue", n: true, sum: true, w: 120, render: (r) => <span className={r.overdue > 0 ? "text-danger" : ""}>{num(r.overdue)}</span> },
];

const BP_COLS: LCol<HistoryRow>[] = [
  { k: "name", l: "Business Partner", w: 240 },
  { k: "collection", l: "Collection", w: 120 },
  { k: "term", l: "Term", w: 150 },
  lamaCol("avgLama", "Rata-rata Lama (hari)", true),
  lamaCol("maxLama", "Terlama (hari)"),
  top3Col(false),
  ...moneyCols,
  { k: "count", l: "Transaksi", n: true, w: 80 },
  { k: "paid", l: "Total Dibayar", n: true, sum: true, w: 130 },
];
const GROUP_COLS: LCol<HistoryRow>[] = [
  { k: "name", l: "Payment Group", w: 260 },
  { k: "bpCount", l: "Jumlah BP", n: true, w: 90 },
  { k: "collection", l: "Collection", w: 160 },
  lamaCol("avgLama", "Rata-rata Lama (hari)", true),
  lamaCol("maxLama", "Terlama (hari)"),
  top3Col(true),
  ...moneyCols,
  { k: "count", l: "Transaksi", n: true, w: 80 },
  { k: "paid", l: "Total Dibayar", n: true, sum: true, w: 130 },
];

// Collection › History Pembayaran BP. Sumber: Invoice & Payment ERP (sama dengan Mutasi Bank) + Master Aging terbaru.
// Mode BP = per BP; mode Group = BP ber-payment group digabung per group, BP tanpa group tetap per BP.
export function HistoryView() {
  const h = usePaymentHistory();
  const [mode, setMode] = useViewState<"bp" | "group">("payhist:mode", "bp");
  const [target, setTarget] = useState<PayHistTarget | null>(null);
  // Per BP = hanya BP tanpa group; Per Group = hanya payment group (BP ber-group ada di dalamnya).
  const rows = useMemo(() => (mode === "bp" ? h.bpRows.filter((r) => !r.group) : h.groupRows.filter((r) => r.jenis === "Group")),
    [mode, h.bpRows, h.groupRows]);
  const missing = h.cov.filter((c) => c.payments === 0).map((c) => monthLabel(c.month));
  const periodTxt = `${monthLabel(h.period.months[0])} – ${monthLabel(h.period.months[2])}`;

  const open = (r: HistoryRow) => setTarget(r.jenis === "Group" ? { kind: "group", name: r.name } : { kind: "bp", key: r.key, name: r.name });
  const seg = (m: "bp" | "group", label: string, icon: string) => (
    <button type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
      className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-sm ${mode === m ? "bg-accent-fill text-on-accent" : "text-fg-2 hover:bg-surface-2"}`}>
      <Icon name={icon} size={16} />{label}
    </button>
  );

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-[22px] font-semibold tracking-tight">History Pembayaran BP</h1>
        <span className="text-sm text-fg-2">
          Periode payment date <b className="text-fg">{periodTxt}</b> · hanya invoice ber-tempo (Net N Days) · tanpa TikTok/Shopee
        </span>
        <span className="flex flex-wrap gap-1.5">
          {h.cov.map((c) => (
            <span key={c.month} title={c.payments ? `${c.payments.toLocaleString("id-ID")} transaksi pembayaran` : "Belum ada data pembayaran bulan ini"}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs ${c.payments ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
              <Icon name={c.payments ? "check_circle" : "cancel"} size={14} />
              {monthLabel(c.month)}{c.payments ? ` · ${c.payments.toLocaleString("id-ID")}` : ""}
            </span>
          ))}
        </span>
        <span className="ml-auto inline-flex overflow-hidden rounded-full border border-line" role="group" aria-label="Mode hitungan">
          {seg("bp", "BP tanpa group", "person")}
          {seg("group", "Payment Group", "groups")}
        </span>
      </div>

      {!h.loading && missing.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-2 text-sm">
          Data pembayaran <b>{missing.join(", ")}</b> belum ada. Upload laporan <i>Invoice &amp; Payment Date Comparison</i> (Payment)
          periode tersebut di Pusat Upload agar history 3 bulan lengkap.
        </div>
      )}

      <LocalTable key={mode} title={mode === "bp" ? "History Pembayaran per BP" : "History Pembayaran per Group"}
        stateKey={`payhist-${mode}`} hideKey={`payhist-${mode}`}
        rows={rows} cols={mode === "bp" ? BP_COLS : GROUP_COLS} rowKey={(r) => r.key} loading={h.loading}
        search={["name", "collection", "top3Text"]}
        filters={[
          { k: "collection", l: "Collection", options: uniq(rows.map((r) => r.collection)) },
          { k: "term", l: "Term", options: uniq(rows.map((r) => r.term)) },
        ]}
        defaultSort={{ k: "avgLama", dir: -1 }} defaultLimit={20} limitWhere={notOld}
        limitNote={`20 ${mode === "bp" ? "BP" : "Group"} dengan rata-rata lama bayar terlama (tanpa invoice telat > ${OLD_DAYS} hari)`}
        onRowClick={open}
        emptyText={`Tidak ada pembayaran BP ber-tempo pada ${periodTxt}.`} />

      <PaymentHistoryModal target={target} onClose={() => setTarget(null)} />
    </div>
  );
}

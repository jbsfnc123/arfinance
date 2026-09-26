"use client";

import { useMemo, useState } from "react";
import { useDataset } from "@/lib/local/store";
import { LocalTable, type LCol } from "@/lib/local/table";
import { coverage, historyPeriod, paymentHistory, type HistoryRow } from "@/lib/modules/collection/payment-history";
import { todayJakarta } from "@/lib/parsers/date";
import { fmtDate, monthLabel, rupiah } from "@/lib/format";
import { DataTableModal, type TableSpec } from "@/components/data-table-modal";
import { card } from "@/components/ui";

const lamaCls = (d: number) => (d <= 0 ? "text-success" : d <= 30 ? "text-warning" : "text-danger");
const lamaTxt = (d: number) => `${d > 0 ? "+" : ""}${d.toLocaleString("id-ID")} hr`;
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));

const COLS: LCol<HistoryRow>[] = [
  { k: "bp", l: "Business Partner", w: 240 },
  { k: "collection", l: "Collection", w: 120 },
  { k: "term", l: "Term", w: 150 },
  { k: "maxLama", l: "Terlama (hari)", n: true, w: 90,
    render: (r) => <span className={`font-medium ${lamaCls(r.maxLama)}`}>{lamaTxt(r.maxLama)}</span> },
  { k: "top3Text", l: "3 Transaksi Terlama", w: 380,
    render: (r) => (
      <span className="flex flex-wrap gap-1">
        {r.top3.map((t, i) => (
          <span key={i} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs" title={`Due ${fmtDate(t.due_date)} · bayar ${fmtDate(t.payment_date)} · ${rupiah(t.amount)}`}>
            {t.invoice_no} <b className={lamaCls(t.lama)}>{lamaTxt(t.lama)}</b>
          </span>
        ))}
      </span>
    ) },
  { k: "outstanding", l: "Sisa Outstanding", n: true, sum: true, w: 130 },
  { k: "overdue", l: "Overdue", n: true, sum: true, w: 120,
    render: (r) => <span className={r.overdue > 0 ? "text-danger" : ""}>{r.overdue.toLocaleString("id-ID")}</span> },
  { k: "avgLama", l: "Rata-rata Lama (hari)", n: true, w: 110,
    render: (r) => <span className={lamaCls(r.avgLama)}>{lamaTxt(r.avgLama)}</span> },
  { k: "count", l: "Transaksi", n: true, w: 80 },
  { k: "paid", l: "Total Dibayar", n: true, sum: true, w: 130 },
  { k: "payment_group", l: "Payment Group", w: 160 },
];

// Collection › History Pembayaran BP. Sumber: Invoice & Payment ERP (sama dengan Mutasi Bank) + Master Aging terbaru.
export function HistoryView() {
  const today = todayJakarta();
  const period = useMemo(() => historyPeriod(today), [today]);
  const erp = useDataset("erp");
  const aging = useDataset("aging");
  const [detail, setDetail] = useState<TableSpec | null>(null);

  const rows = useMemo(() => (erp.data && aging.data ? paymentHistory(erp.data, aging.data.lines, period, today) : []),
    [erp.data, aging.data, period, today]);
  const cov = useMemo(() => (erp.data ? coverage(erp.data, period) : []), [erp.data, period]);
  const missing = cov.filter((c) => c.payments === 0).map((c) => monthLabel(c.month));
  const loading = !erp.data || !aging.data;

  const paid = rows.reduce((s, r) => s + r.paid, 0);
  const tx = rows.reduce((s, r) => s + r.count, 0);
  const avg = paid > 0 ? rows.reduce((s, r) => s + r.avgLama * r.paid, 0) / paid : 0;
  const overdue = rows.reduce((s, r) => s + r.overdue, 0);

  function open(r: HistoryRow) {
    setDetail({
      title: `${r.bp} · ${monthLabel(period.months[0])} – ${monthLabel(period.months[2])}`,
      cols: [
        { k: "invoice_no", l: "Invoice" }, { k: "invoice_date", l: "Invoice Date" }, { k: "due_date", l: "Due Date" },
        { k: "payment_date", l: "Payment Date" }, { k: "lama", l: "Lama (hari)", n: true }, { k: "amount", l: "Dibayar", n: true },
        { k: "term", l: "Term" },
      ],
      rows: r.tx.map((t) => ({ ...t, invoice_date: fmtDate(t.invoice_date), due_date: fmtDate(t.due_date), payment_date: fmtDate(t.payment_date) })),
    });
  }

  const kpi = (label: string, value: string, sub?: string, cls = "") => (
    <div className={`${card} p-4`}>
      <div className="text-xs text-fg-2">{label}</div>
      <div className={`mt-1 text-xl font-medium tabular-nums ${cls}`}>{value}</div>
      {sub && <div className="text-xs text-fg-2">{sub}</div>}
    </div>
  );

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-2xl font-medium">History Pembayaran BP</h1>
        <span className="text-sm text-fg-2">
          Periode payment date <b className="text-fg">{monthLabel(period.months[0])} – {monthLabel(period.months[2])}</b> · hanya BP ber-tempo (Net N Days)
        </span>
        <span className="flex flex-wrap gap-1.5">
          {cov.map((c) => (
            <span key={c.month} title={c.payments ? `${c.payments.toLocaleString("id-ID")} transaksi pembayaran` : "Belum ada data pembayaran bulan ini"}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs ${c.payments ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
              <span className="material-symbols-outlined !text-sm">{c.payments ? "check_circle" : "cancel"}</span>
              {monthLabel(c.month)}{c.payments ? ` · ${c.payments.toLocaleString("id-ID")}` : ""}
            </span>
          ))}
        </span>
      </div>

      {!loading && missing.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-2 text-sm">
          Data pembayaran <b>{missing.join(", ")}</b> belum ada. Upload laporan <i>Invoice &amp; Payment Date Comparison</i> (Payment)
          periode tersebut di Pusat Upload agar history 3 bulan lengkap.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpi("BP ber-tempo dengan pembayaran", rows.length.toLocaleString("id-ID"), `${tx.toLocaleString("id-ID")} transaksi`)}
        {kpi("Total dibayar", rupiah(paid))}
        {kpi("Rata-rata lama bayar", lamaTxt(Math.round(avg * 10) / 10), "tertimbang nominal, dari due date", lamaCls(avg))}
        {kpi("Total overdue (aging terbaru)", rupiah(overdue), undefined, overdue > 0 ? "text-danger" : "")}
      </div>

      <LocalTable title="History Pembayaran BP" hideKey="coll-payhist" rows={rows} cols={COLS} rowKey={(r) => r.key} loading={loading}
        search={["bp", "payment_group", "collection", "top3Text"]}
        filters={[
          { k: "collection", l: "Collection", options: uniq(rows.map((r) => r.collection)) },
          { k: "payment_group", l: "Payment Group", options: uniq(rows.map((r) => r.payment_group)) },
          { k: "term", l: "Term", options: uniq(rows.map((r) => r.term)) },
        ]}
        onRowClick={open}
        emptyText={`Tidak ada pembayaran BP ber-tempo pada ${monthLabel(period.months[0])} – ${monthLabel(period.months[2])}.`} />

      <DataTableModal spec={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

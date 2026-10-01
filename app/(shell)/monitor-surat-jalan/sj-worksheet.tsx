"use client";

import { useMemo } from "react";
import { LocalTable, type LCol } from "@/lib/local/table";
import { btnGhost, segGroup, segItem } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { STATUS_DONE, STATUS_OPEN, type SjRow } from "@/lib/modules/sj/compute";
import type { SjState } from "./use-sj";
import { PeriodFilter, periodText, type Quick } from "./sj-view";

const OK = "bg-success/20 text-success";
const WAIT = "bg-warning/20 text-warning";

const COLS: LCol<SjRow>[] = [
  { k: "sj_no", l: "SJ No." },
  { k: "invoice_no", l: "Invoice No", text: (r) => (r.invoices > 1 ? `${r.invoice_no ?? ""} (+${r.invoices - 1})` : r.invoice_no ?? "") },
  { k: "invoice_date", l: "Invoice Date", d: true },
  { k: "business_partner", l: "Business Partner", w: 240 },
  { k: "area", l: "Area" },
  { k: "marketing", l: "Marketing" },
  { k: "payment_group", l: "Payment Group" },
  { k: "status", l: "Status", badge: { [STATUS_DONE]: OK, [STATUS_OPEN]: WAIT } },
  { k: "receiver", l: "Receiver" },
  { k: "receive_date", l: "Receive Date", d: true },
  { k: "durasi", l: "Durasi (hari)", n: true },
  { k: "umur", l: "Umur belum diterima (hari)", n: true },
  { k: "flag_text", l: "Penanda", wrap: true },
];
const QUICK: { k: Quick; l: string }[] = [
  { k: "", l: "Semua" }, { k: "open", l: STATUS_OPEN }, { k: "cek", l: "Data perlu diperiksa" },
];

// Kertas Kerja: satu baris per No SJ di Aging terbaru (filter sama dengan Dashboard). Ekspor Excel bawaan LocalTable.
export function SjWorksheet({ s, quick, setQuick, focus, setFocus }: {
  s: SjState; quick: Quick; setQuick: (q: Quick) => void; focus: string; setFocus: (k: string) => void;
}) {
  // Fokus dari Dashboard (SJ belum diterima terlama): tampilkan SJ itu saja, walau di luar periode.
  const focused = useMemo(() => (focus ? s.rows.find((r) => r.sj_key === focus) ?? null : null), [focus, s.rows]);
  const rows = useMemo(() => {
    if (focused) return [focused];
    return s.filtered.filter((r) => (quick === "open" ? r.status === STATUS_OPEN : quick === "cek" ? r.perlu_cek : true));
  }, [focused, s.filtered, quick]);
  const receivers = useMemo(() => [...new Set(rows.map((r) => r.receiver ?? ""))].filter(Boolean).sort(), [rows]);

  return (
    <div className="space-y-3">
      {focused ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-pill px-2.5 py-0.5 text-xs text-pill-fg">Filter SJ: {focused.sj_no} · Invoice Date {fmtDate(focused.invoice_date)}</span>
          <button type="button" className={btnGhost} onClick={() => setFocus("")}>Hapus filter SJ</button>
        </div>
      ) : (
        <>
          <PeriodFilter s={s} />
          <div className="flex flex-wrap items-center gap-3">
            <div className={segGroup} role="group" aria-label="Filter cepat">
              {QUICK.map((q) => (
                <button key={q.k || "all"} type="button" aria-pressed={quick === q.k} className={segItem(quick === q.k)} onClick={() => setQuick(q.k)}>{q.l}</button>
              ))}
            </div>
            <span className="text-xs text-fg-2">{periodText(s)}</span>
          </div>
        </>
      )}
      <LocalTable title="Kertas Kerja Surat Jalan" hideKey="sj-kk3" stateKey="sj-kk3" defaultHidden={["area", "marketing", "payment_group", "durasi", "umur", "flag_text"]} rows={rows} cols={COLS} rowKey={(r) => r.sj_key}
        loading={s.loading} defaultSort={{ k: "invoice_date", dir: -1 }}
        search={["sj_no", "invoice_no", "business_partner", "area", "marketing", "payment_group", "receiver", "flag_text"]}
        filters={[
          { k: "status", l: "Status", options: [STATUS_DONE, STATUS_OPEN] },
          { k: "receiver", l: "Receiver", options: receivers },
        ]}
        emptyText="Tidak ada SJ yang cocok dengan filter." />
    </div>
  );
}

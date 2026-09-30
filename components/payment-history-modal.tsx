"use client";

import { useMemo } from "react";
import { useDataset } from "@/lib/local/store";
import {
  agingByBp, groupHistory, historyPeriod, paymentHistory, coverage, type HistoryRow, type HistoryTx,
} from "@/lib/modules/collection/payment-history";
import { todayJakarta } from "@/lib/parsers/date";
import { fmtDate, fmtNum, monthLabel, rupiah } from "@/lib/format";
import { downloadXlsx } from "@/lib/xlsx-client";
import { Modal } from "@/components/modal";
import { TableBox } from "@/components/table-box";
import { btnGhost, card, td, th } from "@/components/ui";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icons";

export type PayHistTarget = { kind: "bp"; key: string; name: string } | { kind: "group"; name: string };

export const lamaCls = (d: number | null) => (d === null ? "text-fg-2" : d <= 0 ? "text-success" : d <= 30 ? "text-warning" : "text-danger");
export const lamaTxt = (d: number | null) => (d === null ? "–" : `${d > 0 ? "+" : ""}${fmtNum(d)} hr`);

/** Hitung semua baris History Pembayaran (mode BP & Group) dari dataset lokal. Dipakai halaman & modal. */
export function usePaymentHistory() {
  const today = todayJakarta();
  const period = useMemo(() => historyPeriod(today), [today]);
  // Paket ERP khusus periode History (±4 bulan), bukan seluruh ERP — kunjungan pertama jauh lebih cepat.
  const erp = useDataset("payhist");
  const aging = useDataset("aging");
  const bpRows = useMemo(() => (erp.data && aging.data ? paymentHistory(erp.data, aging.data.lines, period, today) : []),
    [erp.data, aging.data, period, today]);
  const groupRows = useMemo(() => (aging.data ? groupHistory(bpRows, aging.data.lines, period, today) : []), [bpRows, aging.data, period, today]);
  const cov = useMemo(() => (erp.data ? coverage(erp.data, period) : []), [erp.data, period]);
  return { today, period, bpRows, groupRows, cov, aging: aging.data, loading: !erp.data || !aging.data };
}

// Ringkasan history pembayaran satu BP atau satu Payment Group (3 bulan terakhir, BP ber-tempo).
export function PaymentHistoryModal({ target, onClose }: { target: PayHistTarget | null; onClose: () => void }) {
  const h = usePaymentHistory();
  const toast = useToast();
  const row: HistoryRow | null = useMemo(() => {
    if (!target) return null;
    return target.kind === "bp"
      ? h.bpRows.find((r) => r.key === target.key) ?? null
      : h.groupRows.find((r) => r.key === `G:${target.name}`) ?? null;
  }, [target, h.bpRows, h.groupRows]);

  // BP/group tanpa pembayaran ber-tempo di periode: tetap tampilkan sisa & overdue dari aging.
  const agingInfo = useMemo(() => {
    if (!target || row || !h.aging) return null;
    const ag = agingByBp(h.aging.lines, h.today);
    const list = target.kind === "bp" ? [ag.get(target.key)].filter(Boolean) : [...ag.values()].filter((a) => a.group === target.name);
    return { out: list.reduce((s, a) => s + a!.out, 0), over: list.reduce((s, a) => s + a!.over, 0), bps: list.length };
  }, [target, row, h.aging, h.today]);

  if (!target) return null;
  const periodTxt = `${monthLabel(h.period.months[0])} – ${monthLabel(h.period.months[2])}`;
  const title = `${target.kind === "group" ? "Group" : "BP"} · ${target.name}`;
  const covMap = new Map(h.cov.map((c) => [c.month, c.payments]));

  // Nama sheet bukan "History" (nama cadangan Excel — SheetJS menolak & tombol dulu tampak tidak bereaksi).
  async function exportTx() {
    if (!row) return;
    try {
      await downloadXlsx(`History Pembayaran ${target!.name}.xlsx`, "Transaksi", [
        ["Business Partner", "Invoice", "Invoice Date", "Due Date", "Payment Date", "Lama (hari)", "Dibayar", "Term"],
        ...row.tx.map((t) => [t.bp, t.invoice_no, t.invoice_date ?? "", t.due_date, t.payment_date, t.lama, t.amount, t.term]),
      ]);
    } catch (e) {
      toast(`Gagal mengunduh Excel: ${(e as Error).message}`, "danger");
    }
  }

  const stat = (label: string, value: React.ReactNode, cls = "") => (
    <div className={`${card} px-3 py-2`}>
      <div className="text-xs text-fg-2">{label}</div>
      <div className={`font-medium tabular-nums ${cls}`}>{value}</div>
    </div>
  );
  const txRow = (t: HistoryTx, withBp: boolean) => (
    <tr key={`${t.invoice_no}|${t.payment_date}|${t.amount}`} className="border-t border-line/60">
      {withBp && <td className={`${td} max-w-56 truncate`} title={t.bp}>{t.bp}</td>}
      <td className={td}>{t.invoice_no}</td>
      <td className={td}>{fmtDate(t.due_date)}</td>
      <td className={td}>{fmtDate(t.payment_date)}</td>
      <td className={`${td} text-right tabular-nums font-medium ${lamaCls(t.lama)}`}>{lamaTxt(t.lama)}</td>
      <td className={`${td} text-right tabular-nums`}>{Math.round(t.amount).toLocaleString("id-ID")}</td>
      <td className={`${td} text-fg-2`}>{t.term}</td>
    </tr>
  );
  const isGroup = target.kind === "group";

  return (
    <Modal open onClose={onClose} title={`History Pembayaran — ${title}`} xl variant="window">
      <div className="space-y-4 text-sm">
        <p className="text-fg-2">Periode payment date <b className="text-fg">{periodTxt}</b> · hanya invoice ber-tempo · lama = payment date − due date</p>
        {h.loading ? <p className="text-fg-2">Memuat data…</p> : !row ? (
          <div className="rounded-xl border border-line bg-surface-2 p-4">
            Tidak ada pembayaran invoice ber-tempo pada {periodTxt}
            {target.kind === "bp" ? " untuk BP ini (atau BP marketplace / tanpa tempo)." : " untuk group ini."}
            {agingInfo && agingInfo.bps > 0 && (
              <div className="mt-2">Sisa outstanding <b>{rupiah(agingInfo.out)}</b> · overdue <b className={agingInfo.over > 0 ? "text-danger" : ""}>{rupiah(agingInfo.over)}</b> (aging terbaru)</div>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
              {stat("Term terbanyak", row.term || "–")}
              {stat(isGroup ? "BP / Transaksi" : "Transaksi", isGroup ? `${row.bpCount} / ${row.count}` : row.count.toLocaleString("id-ID"))}
              {stat("Total dibayar", rupiah(row.paid))}
              {stat("Rata-rata lama", lamaTxt(row.avgLama), lamaCls(row.avgLama))}
              {stat("Terlama", lamaTxt(row.maxLama), lamaCls(row.maxLama))}
              {stat(isGroup ? "Outstanding (seluruh group)" : "Sisa outstanding", rupiah(row.outstanding))}
              {stat("Overdue", rupiah(row.overdue), row.overdue > 0 ? "text-danger" : "")}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className={`${card} overflow-hidden`}>
                <h3 className="px-3 pt-3 font-medium">Per bulan</h3>
                <table className="mt-1 w-full">
                  <thead><tr><th className={th}>Bulan</th><th className={`${th} text-right`}>Transaksi</th><th className={`${th} text-right`}>Dibayar</th><th className={`${th} text-right`}>Rata-rata lama</th></tr></thead>
                  <tbody>
                    {row.months.map((m) => (
                      <tr key={m.month} className="border-t border-line/60">
                        <td className={td}>{monthLabel(m.month)}{!covMap.get(m.month) && <span className="ml-2 text-xs text-danger" title="Data pembayaran bulan ini belum di-upload">belum ada data</span>}</td>
                        <td className={`${td} text-right tabular-nums`}>{m.count}</td>
                        <td className={`${td} text-right tabular-nums`}>{Math.round(m.paid).toLocaleString("id-ID")}</td>
                        <td className={`${td} text-right tabular-nums ${lamaCls(m.avgLama)}`}>{lamaTxt(m.avgLama)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <section className={`${card} overflow-hidden`}>
                <h3 className="px-3 pt-3 font-medium">3 transaksi terlama</h3>
                <table className="mt-1 w-full">
                  <thead><tr>{isGroup && <th className={th}>BP</th>}<th className={th}>Invoice</th><th className={th}>Due</th><th className={th}>Bayar</th><th className={`${th} text-right`}>Lama</th><th className={`${th} text-right`}>Dibayar</th><th className={th}>Term</th></tr></thead>
                  <tbody>{row.top3.map((t) => txRow(t, isGroup))}</tbody>
                </table>
              </section>
            </div>

            {isGroup && (
              <section className={`${card} overflow-hidden`}>
                <h3 className="px-3 pt-3 font-medium">Per BP dalam group ({row.members.length} BP dengan pembayaran)</h3>
                <TableBox bare fill={false} maxHeight="max-h-[30vh]" className="mt-1">
                  <table className="w-full">
                    <thead><tr><th className={th}>Business Partner</th><th className={th}>Collection</th><th className={`${th} text-right`}>Transaksi</th><th className={`${th} text-right`}>Rata-rata</th><th className={`${th} text-right`}>Terlama</th><th className={`${th} text-right`}>Outstanding</th><th className={`${th} text-right`}>Overdue</th></tr></thead>
                    <tbody>
                      {row.members.map((m) => (
                        <tr key={m.key} className="border-t border-line/60">
                          <td className={`${td} max-w-72 truncate`} title={m.name}>{m.name}</td>
                          <td className={td}>{m.collection}</td>
                          <td className={`${td} text-right tabular-nums`}>{m.count}</td>
                          <td className={`${td} text-right tabular-nums ${lamaCls(m.avgLama)}`}>{lamaTxt(m.avgLama)}</td>
                          <td className={`${td} text-right tabular-nums ${lamaCls(m.maxLama)}`}>{lamaTxt(m.maxLama)}</td>
                          <td className={`${td} text-right tabular-nums`}>{Math.round(m.outstanding).toLocaleString("id-ID")}</td>
                          <td className={`${td} text-right tabular-nums ${m.overdue > 0 ? "text-danger" : ""}`}>{Math.round(m.overdue).toLocaleString("id-ID")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableBox>
              </section>
            )}

            <section className={`${card} overflow-hidden`}>
              <div className="flex items-center gap-2 px-3 pt-3">
                <h3 className="font-medium">Semua transaksi ({row.tx.length})</h3>
                <button type="button" className={`${btnGhost} ml-auto`} onClick={exportTx}>
                  <Icon name="download" size={16} />Excel
                </button>
              </div>
              <TableBox bare fill={false} maxHeight="max-h-[35vh]" className="mt-2">
                <table className="w-full">
                  <thead><tr>{isGroup && <th className={th}>BP</th>}<th className={th}>Invoice</th><th className={th}>Due</th><th className={th}>Bayar</th><th className={`${th} text-right`}>Lama</th><th className={`${th} text-right`}>Dibayar</th><th className={th}>Term</th></tr></thead>
                  <tbody>{row.tx.map((t) => txRow(t, isGroup))}</tbody>
                </table>
              </TableBox>
            </section>
          </>
        )}
      </div>
    </Modal>
  );
}

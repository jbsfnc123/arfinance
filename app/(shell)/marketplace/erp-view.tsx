"use client";

import { platformOf, type Report } from "@/lib/modules/marketplace/parse";
import { buildErpRecon, ERP_STATUS_CLASS, erpSubsidi, fmt, sumBy } from "@/lib/modules/marketplace/analysis";
import { ERP_COLS } from "@/lib/modules/marketplace/tables";
import type { TableSpec } from "@/components/data-table-modal";
import { card, inputCls } from "@/components/ui";

const CHIP = { bad: "border-danger/50 text-danger", warn: "border-warning/50 text-warning", ok: "border-success/50 text-success", "": "border-line" };

// Halaman Rekonsiliasi ERP: invoice vs payment ERP dijelaskan oleh biaya marketplace.
export function ErpView({ R, limit, setLimit, show }: { R: Report; limit: number; setLimit: (v: number) => void; show: (s: TableSpec) => void }) {
  const rows = buildErpRecon(R, limit);
  const sub = erpSubsidi(R);
  const pesanan = rows.filter((r) => r.invoiceNo);
  const masalah = rows.filter((r) => r.status !== "Cocok");
  const totalInv = pesanan.reduce((a, r) => a + r.invoice, 0) + sub.erpTotal;
  const totalPay = pesanan.reduce((a, r) => a + r.payment, 0) + sub.erpBayar;
  const all = () => show({ title: "Semua Invoice ERP", rows, cols: ERP_COLS });

  const kartu = [
    { lbl: "Total Invoice", val: totalInv, note: `${pesanan.length.toLocaleString("id-ID")} invoice pesanan + ${sub.baris.length} invoice subsidi`, go: all },
    { lbl: "Total Payment", val: totalPay, note: "Nilai yang sudah dibayar menurut ERP", go: all },
    { lbl: "Selisih Invoice − Payment", val: totalInv - totalPay, note: "Seharusnya sama dengan biaya marketplace", go: all },
    { lbl: "Perlu Dicek", val: masalah.length, count: true, alert: masalah.length > 0,
      note: masalah.length ? "baris tidak cocok dengan laporan marketplace" : "Semua invoice cocok",
      go: () => show({ title: "Rekonsiliasi ERP — Perlu Dicek", rows: masalah, cols: ERP_COLS }) },
  ];
  const grup = [...Object.keys(ERP_STATUS_CLASS).map((st) => ({ l: st, rows: rows.filter((r) => r.status === st), cls: ERP_STATUS_CLASS[st] })),
    { l: "Semua", rows, cls: "" as const }];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
        <span className="mr-auto">
          {R.erpMeta.org || "ERP"} · {R.erpMeta.paymentGroup || platformOf(R).label} · {R.erpMeta.dari || R.meta.dari} s/d {R.erpMeta.ke || R.meta.ke} · {R.Erp.length.toLocaleString("id-ID")} baris
        </span>
        <label className="text-xs">Toleransi tidak terjelaskan (Rp)
          <input type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value) || 0)} className={`${inputCls} ml-2 !w-28 !py-1`} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kartu.map((k) => (
          <button key={k.lbl} type="button" onClick={k.go} className={`${card} p-4 text-left hover:border-accent ${k.alert ? "border-danger/60" : ""}`}>
            <div className="text-xs text-fg-2">{k.lbl}</div>
            <div className={`mt-1 text-lg font-medium ${k.count ? "" : k.val < 0 ? "text-danger" : "text-success"}`}>
              {k.count ? k.val.toLocaleString("id-ID") : fmt(k.val)}
            </div>
            <div className="text-xs text-fg-2">{k.note}</div>
          </button>
        ))}
      </div>

      <section className={`${card} space-y-3 p-4`}>
        <div className="flex flex-wrap gap-2">
          {grup.map((g) => (
            <button key={g.l} type="button" onClick={() => show({ title: "Rekonsiliasi ERP — " + g.l, rows: g.rows, cols: ERP_COLS })}
              className={`rounded-full border px-3 py-1 text-xs ${CHIP[g.cls]}`}>{g.l}: <b>{g.rows.length}</b></button>
          ))}
        </div>
        <p className="text-sm">
          {sub.baris.length ? (
            <>
              Invoice subsidi (PO &quot;-&quot;): <b>{sub.baris.length}</b> invoice senilai <b>{fmt(sub.erpTotal)}</b>, menurut laporan
              marketplace <b>{fmt(sub.laporan)}</b> → selisih <b className={Math.abs(sub.selisih) > limit ? "text-danger" : "text-success"}>{fmt(sub.selisih)}</b>.{" "}
              <button type="button" className="text-accent hover:underline" onClick={() => show({ title: 'Invoice Subsidi (PO "-")', rows: sub.baris, cols: [
                { k: "invoiceNo", l: "No. Invoice" }, { k: "invoiceDate", l: "Tgl Invoice" }, { k: "invoiceAmount", l: "Invoice Amount", n: true },
                { k: "paymentDoc", l: "Dokumen Bayar" }, { k: "paymentAmount", l: "Payment Amount", n: true }, { k: "paymentDate", l: "Tgl Bayar" }] })}>
                Lihat daftar
              </button>
            </>
          ) : "Tidak ada invoice subsidi di file ERP ini."}
        </p>
        {masalah.length > 0 && (
          <table className="w-full text-xs">
            <thead><tr>{["No. Pesanan", "Invoice", "Payment", "Selisih ERP", "Tidak Terjelaskan", "Status"].map((h, i) => <th key={h} className={`px-2 py-1 font-medium text-fg-2 ${i && i < 5 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
            <tbody>
              {masalah.slice(0, 8).map((r, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-2 py-1">{r.no}</td>
                  <td className="px-2 py-1 text-right">{Math.round(r.invoice).toLocaleString("id-ID")}</td>
                  <td className="px-2 py-1 text-right">{Math.round(r.payment).toLocaleString("id-ID")}</td>
                  <td className="px-2 py-1 text-right">{Math.round(r.selisihErp).toLocaleString("id-ID")}</td>
                  <td className={`px-2 py-1 text-right ${r.takTerjelaskan ? "text-danger" : ""}`}>{Math.round(r.takTerjelaskan).toLocaleString("id-ID")}</td>
                  <td className="px-2 py-1">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {sumBy(R.Erp, "invoiceAmount") === 0 && <p className="text-xs text-fg-2">File ERP tidak berisi nilai invoice.</p>}
    </div>
  );
}

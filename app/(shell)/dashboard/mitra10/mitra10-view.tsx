"use client";

import { useMemo } from "react";
import { useDataset } from "@/lib/local/store";
import { arInvoices, collectionRows, filterOf } from "@/lib/modules/collection/rows";
import { todayJakarta } from "@/lib/parsers/date";
import { monthLabel, rupiah } from "@/lib/format";
import { enrichRow, type CollectionRow } from "@/lib/modules/collection/view-model";
import { mitra10Summary, type Mitra10Month } from "@/lib/modules/collection/mitra10";
import { btnGhost, card, td, th } from "@/components/ui";
import { NoteLog } from "../../collection/case/note-log";

export function Mitra10View({ collection, prefix }: { collection: string; prefix: string }) {
  const aging = useDataset("aging");
  const activity = useDataset("activity");
  const settings = useDataset("settings");
  // Baris collection CMSS dihitung di browser dari dataset lokal.
  const rows = useMemo<CollectionRow[] | null>(() => {
    if (!aging.data || !activity.data) return null;
    const p = prefix.toLowerCase();
    const ar = arInvoices(aging.data.lines, filterOf(settings.data))
      .filter((a) => a.collection_name === collection && (a.payment_group ?? "").toLowerCase().startsWith(p));
    const today = todayJakarta();
    return collectionRows(ar, activity.data).map((r) => enrichRow(r, today));
  }, [aging.data, activity.data, settings.data, collection, prefix]);
  const reload = () => { void aging.reload(); void activity.reload(); };

  const s = useMemo(() => (rows ? mitra10Summary(rows) : null), [rows]);
  const invoiceSet = useMemo(() => (rows ? new Set(rows.map((r) => r.invoice_no)) : null), [rows]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-medium">Dashboard Mitra 10</h1>
          <p className="text-sm text-fg-2">
            {s ? `${s.totalInv} invoice Catur Mitra Sejati Sentosa` : "Memuat…"} · sumber Collection {collection}
          </p>
        </div>
        <button type="button" className={`${btnGhost} ml-auto`} onClick={reload}>
          <span className="material-symbols-outlined">refresh</span>Refresh
        </button>
      </div>

      {s && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Total Piutang" value={rupiah(s.totalPiutang)} sub={`${s.totalInv} invoice`} />
            <Kpi label="Jadwal Bayar" value={rupiah(s.jadwalNom)} sub={`${s.jadwalInv} invoice sudah punya tanggal janji bayar`} />
            <Kpi
              label="Rata-rata Waktu Pembayaran"
              value={s.avgHari === null ? "—" : `${s.avgHari} hari`}
              sub={`janji bayar − tukar faktur · dari ${s.nHari} invoice`}
            />
          </div>
          <MonthTable title="Akumulasi Jumlah Invoice" months={s.months} total={s.total} money={false} />
          <MonthTable title="Akumulasi Nominal Sisa Piutang" months={s.months} total={s.total} money />
        </>
      )}

      {invoiceSet ? (
        <NoteLog kategori="Administratif" invoiceFilter={invoiceSet} />
      ) : (
        <p className="text-sm text-fg-2">Menunggu data invoice…</p>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className={`${card} p-4`}>
      <div className="text-xs text-fg-2">{label}</div>
      <div className="mt-1 text-lg font-medium">{value}</div>
      <div className="text-xs text-fg-2">{sub}</div>
    </div>
  );
}

function MonthTable({ title, months, total, money }: { title: string; months: Mitra10Month[]; total: Mitra10Month; money: boolean }) {
  const cols = money
    ? (["nInv", "nSudah", "nBelum", "nJadwal"] as const)
    : (["cInv", "cSudah", "cBelum", "cJadwal"] as const);
  const fmt = (v: number) => (money ? rupiah(v) : v.toLocaleString("id-ID"));
  return (
    <section className={`${card} overflow-x-auto`}>
      <h2 className="px-4 pt-4 text-sm font-medium">{title}</h2>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr>
            <th className={th}>Bulan</th>
            {["Total Invoice", "Sudah Tukar Faktur", "Belum Tukar Faktur", "Jadwal Bayar"].map((h) => (
              <th key={h} className={`${th} text-right`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...months, total].map((m) => (
            <tr key={m.ym || "tanpa"} className={`border-t border-line ${m === total ? "font-medium" : ""}`}>
              <td className={td}>{m === total ? "Total" : m.ym ? monthLabel(m.ym) : "Tanpa Tanggal"}</td>
              {cols.map((c) => <td key={c} className={`${td} text-right`}>{fmt(m[c])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

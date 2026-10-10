"use client";

// Pengaturan › Arsip Data: data historis yang sudah dipindah dari Supabase ke Google Drive. Pilih data & periode →
// tabel (cari, filter, kolom, unduh Excel lewat LocalTable).
import { useEffect, useMemo, useState } from "react";
import { Tabs } from "@/components/tabs";
import { LocalTable, type LCol } from "@/lib/local/table";
import { useViewState } from "@/lib/ui/view-state";
import { inputCls } from "@/components/ui";
import { fmtTimestamp } from "@/lib/format";
import { fmtBytes } from "@/lib/modules/usage";
import { ARCHIVE_DATASETS, type ArchiveDataset, type ArchiveFile } from "@/lib/archive/datasets";
import { loadArchive, useArchiveList } from "@/lib/archive/client";
import { BackupsSection } from "./backups";

type Row = Record<string, unknown> & { __k: string };

const NUM = /amount|open_amt|target|cur_|due_\d|due_90|credit_limit|qty|^days$/;
const DATE = /_date$|^as_of$|^tx_date$/;
const HIDE = new Set(["snapshot_id", "updated_at", "recorded_by", "created_by"]);

export function ArchiveView() {
  const [ds, setDs] = useViewState<ArchiveDataset>("arsip:ds", "erp_payments");
  const list = useArchiveList(ds);
  const [chosen, setPeriod] = useState<string>("");
  // Hasil buka file per id arsip (state turunan: berganti periode = loading sampai hasil id itu ada).
  const [opened, setOpened] = useState<{ id: number; file: ArchiveFile | null; err: string | null } | null>(null);

  const entries = list ?? [];
  const period = entries.some((e) => e.period === chosen) ? chosen : entries[0]?.period ?? "";
  const entry = entries.find((e) => e.period === period) ?? null;
  useEffect(() => {
    if (!entry) return;
    let live = true;
    loadArchive(entry.id).then((f) => { if (live) setOpened({ id: entry.id, file: f, err: null }); },
      (e: Error) => { if (live) setOpened({ id: entry.id, file: null, err: e.message }); });
    return () => { live = false; };
  }, [entry?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = entry && opened?.id === entry.id ? opened : null;
  const file = cur?.file ?? null, err = cur?.err ?? null, loading = !!entry && !cur;

  // Pembayaran membawa salinan invoice (objek `invoice`): ratakan kolom yang berguna, objeknya tidak ditampilkan.
  const rows: Row[] = useMemo(() => (file?.rows ?? []).map((r, i) => {
    const { invoice, ...rest } = r as Record<string, unknown> & { invoice?: Record<string, unknown> | null };
    const inv = invoice ? { bp_name: invoice.bp_name, invoice_date: invoice.invoice_date, due_date: invoice.due_date, payment_term: invoice.payment_term } : {};
    return { ...rest, ...inv, __k: String(i) };
  }), [file]);
  const cols: LCol<Row>[] = useMemo(() => {
    const keys = Object.keys(rows[0] ?? {}).filter((k) => !HIDE.has(k) && k !== "__k");
    return keys.map((k) => ({ k, l: k.replace(/_/g, " "), n: NUM.test(k), d: DATE.test(k), sum: NUM.test(k) && !/days|qty/.test(k) }));
  }, [rows]);
  const search = cols.filter((c) => !c.n).map((c) => c.k);

  return (
    <div className="w-full space-y-4">
      <h1 className="text-[22px] font-semibold tracking-tight">Arsip Data</h1>
      <Tabs tabs={ARCHIVE_DATASETS.map((d) => ({ key: d.id, label: d.label, icon: "inventory_2" }))} value={ds} onChange={(k) => { setDs(k); setPeriod(""); }} />
      <div className="flex flex-wrap items-end gap-3 text-[13px]">
        <label className="grid gap-1">
          <span className="text-xs text-fg-2">Periode</span>
          <select className={`${inputCls} w-64`} value={period} onChange={(e) => setPeriod(e.target.value)} disabled={!entries.length} aria-label="Periode arsip">
            {!entries.length && <option value="">{list === null ? "Memuat…" : "Belum ada arsip"}</option>}
            {entries.map((e) => <option key={e.id} value={e.period}>{e.label ?? e.period}</option>)}
          </select>
        </label>
        {entry && <span className="pb-1.5 text-xs text-fg-2">{entry.rows.toLocaleString("id-ID")} baris · {fmtBytes(entry.bytes)} · diarsip {fmtTimestamp(entry.createdAt)}</span>}
      </div>
      {err && <p className="text-sm text-danger" role="alert">Gagal membuka arsip: {err}</p>}
      {entry && (
        <LocalTable key={`${ds}:${entry.id}`} title={`Arsip ${ARCHIVE_DATASETS.find((d) => d.id === ds)?.label} ${entry.label ?? entry.period}`}
          rows={rows} cols={cols} rowKey={(r) => r.__k} search={search} loading={loading || (!file && !err)} hideKey={`arsip-${ds}`} />
      )}
      <BackupsSection />
    </div>
  );
}

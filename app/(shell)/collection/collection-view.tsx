"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useDataset } from "@/lib/local/store";
import { arInvoices, collectionRows, collectionSummary, filterOf } from "@/lib/modules/collection/rows";
import { setRemarks, useRemarks } from "@/lib/modules/remarks";
import { todayJakarta } from "@/lib/parsers/date";
import { fmtTimestamp, rupiah } from "@/lib/format";
import {
  applyExchange, DEFAULT_COLUMNS, EMPTY_FILTERS, enrichRow, filterRows, withSearch,
  type CollectionRow, type ColumnKey, type Filters,
} from "@/lib/modules/collection/view-model";
import type { WaTemplate } from "@/lib/modules/collection/wa-message";
import { btnGhost, card, inputCls } from "@/components/ui";
import { KpiPanel, CategoryCards } from "./kpi-panel";
import { FilterBar } from "./filter-bar";
import { RowsTable } from "./rows-table";
import { ActionBar } from "./action-bar";

export type Patch = (invoiceNos: string[], fn: (r: CollectionRow) => CollectionRow) => void;

// Baris collection dihitung di browser dari dataset lokal (aging snapshot + aktivitas + setting);
// perubahan dari aksi/realtime ditambal sebagai "override" sampai dataset versi baru tiba.
export function CollectionView(props: {
  initial: string;
  locked: boolean;
  own: string | null;
  serverTemplate: Partial<WaTemplate> | null;
  lastUpdate: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const aging = useDataset("aging");
  const activity = useDataset("activity");
  const settings = useDataset("settings");
  const remarks = useRemarks();
  const [coll, setColl] = useState(props.initial);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [columns, setColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [selection, setSelection] = useState<string[]>([]);

  const ar = useMemo(() => (aging.data ? arInvoices(aging.data.lines, filterOf(settings.data)) : []), [aging.data, settings.data]);
  const collections = useMemo(() => {
    const list = collectionSummary(ar).filter((c) => !props.locked || c.name === props.own);
    if (props.locked && props.own && !list.length) list.push({ name: props.own, invoices: 0, total: 0 });
    return list;
  }, [ar, props.locked, props.own]);
  const base = useMemo(() => {
    if (!coll || !activity.data) return [];
    const today = todayJakarta();
    return collectionRows(ar.filter((a) => a.collection_name === coll), activity.data, remarks.map).map((r) => enrichRow(r, today));
  }, [ar, activity.data, coll, remarks.map]);

  const [overrides, setOverrides] = useState<{ base: CollectionRow[]; map: Map<string, CollectionRow> }>({ base, map: new Map() });
  if (overrides.base !== base) setOverrides({ base, map: new Map() }); // data versi baru → override lama dibuang
  const rows = useMemo(() => (overrides.map.size ? base.map((r) => overrides.map.get(r.invoice_no) ?? r) : base), [base, overrides]);
  const loading = !aging.data || !activity.data || aging.loading;

  function reload() {
    void aging.reload();
    void activity.reload();
    void settings.reload();
  }

  const patch: Patch = useCallback((invoiceNos, fn) => {
    setOverrides((prev) => {
      const map = new Map(prev.map);
      const byInv = new Map(prev.base.map((r) => [r.invoice_no, r]));
      for (const inv of invoiceNos) {
        const cur = map.get(inv) ?? byInv.get(inv);
        if (cur) map.set(inv, fn(cur));
      }
      return { base: prev.base, map };
    });
  }, []);

  // Realtime: catatan / janji bayar / tukar faktur dari pengguna lain langsung ditambal ke baris.
  useEffect(() => {
    if (!coll) return;
    const filter = `collection_name=eq.${coll}`;
    const channel = supabase
      .channel(`collection:${coll}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notes", filter }, ({ new: n }) => {
        const catatan = `[${n.kategori}]${n.isi ? " - " + n.isi : ""}`;
        patch([n.invoice_no], (r) => withSearch({ ...r, catatan }));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "payment_promises", filter }, ({ new: p }) => {
        patch([p.invoice_no], (r) => withSearch({ ...r, janji_bayar: p.promise_date }));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "invoice_exchanges", filter }, ({ new: x }) => {
        patch([x.invoice_no], (r) => applyExchange(r, x as Parameters<typeof applyExchange>[1]));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coll, supabase, patch]);

  const filtered = useMemo(() => filterRows(rows, filters), [rows, filters]);
  const byInvoice = useMemo(() => new Map(rows.map((r) => [r.invoice_no, r])), [rows]);
  const selectedRows = useMemo(
    () => selection.map((inv) => byInvoice.get(inv)).filter((r): r is CollectionRow => !!r),
    [selection, byInvoice],
  );

  function pick(name: string) {
    // Ganti collection: kosongkan filter, pilihan, dan data (seperti showApp lama).
    setFilters(EMPTY_FILTERS);
    setSelection([]);
    setColl(name);
    router.replace(name ? `/collection?c=${encodeURIComponent(name)}` : "/collection");
  }

  if (!coll) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-medium">Collection</h1>
        <p className="mt-1 text-sm text-fg-2">Pilih collection. Data per: {fmtTimestamp(aging.data?.uploadedAt ?? props.lastUpdate)}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((c) => (
            <button key={c.name} type="button" onClick={() => pick(c.name)} className={`${card} p-4 text-left hover:border-accent`}>
              <div className="font-medium">{c.name}</div>
              <div className="mt-1 text-sm text-fg-2">
                {c.invoices.toLocaleString("id-ID")} invoice · {rupiah(c.total)}
              </div>
            </button>
          ))}
          {collections.length === 0 && (
            <p className="text-sm text-fg-2">{loading ? "Memuat data…" : "Belum ada data tagihan. Upload lewat Pengaturan → Pusat Upload Data."}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={selection.length ? "pb-28" : ""}>
      <div className="flex flex-wrap items-center gap-3">
        {props.locked ? (
          <h1 className="text-xl font-medium">{coll}</h1>
        ) : (
          <select value={coll} onChange={(e) => pick(e.target.value)} className={`${inputCls} !w-auto text-base font-medium`}>
            {collections.map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        )}
        <span className="text-xs text-fg-2">Data per: {fmtTimestamp(aging.data?.uploadedAt ?? props.lastUpdate)}</span>
        <button type="button" className={`${btnGhost} relative ml-auto`} onClick={reload} disabled={loading}>
          <span className="material-symbols-outlined">refresh</span>
          Refresh
        </button>
      </div>

      <KpiPanel rows={rows} filters={filters} setFilters={setFilters} loading={loading} />
      <CategoryCards rows={rows} filters={filters} setFilters={setFilters} />

      <FilterBar
        rows={rows}
        filters={filters}
        setFilters={setFilters}
        columns={columns}
        setColumns={setColumns}
        shown={filtered.length}
      />

      <RowsTable
        rows={filtered}
        columns={columns}
        loading={loading}
        selection={selection}
        setSelection={setSelection}
        onEditKeterangan={(inv, current) => {
          const text = window.prompt(`Keterangan invoice ${inv} (sama dengan Mitra10 & Hold Faktur Pajak):`, current);
          if (text === null) return;
          patch([inv], (r) => withSearch({ ...r, keterangan: text.trim() }));
          setRemarks([inv], text, "collection").catch(() => patch([inv], (r) => withSearch({ ...r, keterangan: current })));
        }}
      />

      <ActionBar
        collection={coll}
        selected={selectedRows}
        columns={columns}
        clear={() => setSelection([])}
        patch={patch}
        serverTemplate={props.serverTemplate}
      />
    </div>
  );
}

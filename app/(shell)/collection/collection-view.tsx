"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cachedQuery } from "@/lib/cache/cached-query";
import { todayJakarta } from "@/lib/parsers/date";
import { fmtTimestamp, rupiah } from "@/lib/format";
import {
  applyExchange, DEFAULT_COLUMNS, EMPTY_FILTERS, enrichRow, filterRows, withSearch,
  type CollectionRow, type ColumnKey, type Filters,
} from "@/lib/modules/collection/view-model";
import type { WaTemplate } from "@/lib/modules/collection/wa-message";
import { useToast } from "@/components/toast";
import { btnGhost, card, inputCls } from "@/components/ui";
import { KpiPanel, CategoryCards } from "./kpi-panel";
import { FilterBar } from "./filter-bar";
import { RowsTable } from "./rows-table";
import { ActionBar } from "./action-bar";

type CollectionInfo = { name: string; invoices: number; total: number };
const PAGE = 1000;

export type Patch = (invoiceNos: string[], fn: (r: CollectionRow) => CollectionRow) => void;

// Semua baris satu collection, per halaman 1000 (batas PostgREST). Baris mentah disimpan di
// cache browser berkunci versi data (aging, aktivitas catatan/tukar, setting); aging dihitung
// ulang dari tanggal hari ini setiap kali.
async function fetchRows(supabase: ReturnType<typeof createClient>, name: string, force: boolean) {
  const { data: raw } = await cachedQuery(supabase, {
    key: `collection:${name}`, deps: ["aging", "activity", "settings"], force,
    load: async () => {
      const out: Parameters<typeof enrichRow>[0][] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("v_collection_rows").select("*")
          .eq("collection_name", name).order("invoice_no")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        out.push(...data);
        if (data.length < PAGE) return out;
      }
    },
  });
  const today = todayJakarta();
  return raw.map((r) => enrichRow(r, today));
}

export function CollectionView(props: {
  collections: CollectionInfo[];
  initial: string;
  locked: boolean;
  serverTemplate: Partial<WaTemplate> | null;
  lastUpdate: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [coll, setColl] = useState(props.initial);
  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(!!props.initial);
  const [reloadKey, setReloadKey] = useState(0);
  const [newData, setNewData] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [columns, setColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [selection, setSelection] = useState<string[]>([]);
  const loadedAt = useRef<string | null>(null);
  const forceNext = useRef(false); // tombol Muat ulang melewati cache

  useEffect(() => {
    if (!coll) return;
    let cancelled = false;
    const force = forceNext.current;
    forceNext.current = false;
    fetchRows(supabase, coll, force)
      .then((out) => {
        if (cancelled) return;
        setRows(out);
        loadedAt.current = new Date().toISOString();
      })
      .catch((e: Error) => !cancelled && toast(`Gagal memuat data: ${e.message}`, "danger"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [coll, reloadKey, supabase, toast]);

  function reload() {
    forceNext.current = true;
    setLoading(true);
    setNewData(false);
    setReloadKey((k) => k + 1);
    router.refresh();
  }

  const patch: Patch = useCallback((invoiceNos, fn) => {
    const set = new Set(invoiceNos);
    setRows((prev) => prev.map((r) => (set.has(r.invoice_no) ? fn(r) : r)));
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
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "data_versions" }, ({ new: v }) => {
        if (v.key === "ar_invoices" && loadedAt.current && v.updated_at > loadedAt.current) setNewData(true);
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
    setRows([]);
    setNewData(false);
    setLoading(!!name);
    setColl(name);
    router.replace(name ? `/collection?c=${encodeURIComponent(name)}` : "/collection");
  }

  if (!coll) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-medium">Collection</h1>
        <p className="mt-1 text-sm text-fg-2">Pilih collection. Data per: {fmtTimestamp(props.lastUpdate)}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {props.collections.map((c) => (
            <button key={c.name} type="button" onClick={() => pick(c.name)} className={`${card} p-4 text-left hover:border-accent`}>
              <div className="font-medium">{c.name}</div>
              <div className="mt-1 text-sm text-fg-2">
                {c.invoices.toLocaleString("id-ID")} invoice · {rupiah(c.total)}
              </div>
            </button>
          ))}
          {props.collections.length === 0 && (
            <p className="text-sm text-fg-2">Belum ada data tagihan. Upload lewat Pengaturan → Update Tagihan.</p>
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
            {props.collections.map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        )}
        <span className="text-xs text-fg-2">Data per: {fmtTimestamp(props.lastUpdate)}</span>
        <button type="button" className={`${btnGhost} relative ml-auto`} onClick={reload} disabled={loading}>
          <span className="material-symbols-outlined">refresh</span>
          Refresh
          {newData && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-danger" title="Ada data baru" />}
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

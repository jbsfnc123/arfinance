"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useDataset } from "@/lib/local/store";
import { collectionSummary } from "@/lib/modules/collection/rows";
import { arOf, collectionRowsOf } from "@/lib/local/derived";
import { setRemarks, useRemarks } from "@/lib/modules/remarks";
import { todayJakarta } from "@/lib/parsers/date";
import { fmtTimestamp, rupiah } from "@/lib/format";
import {
  applyExchange, DEFAULT_COLUMNS, EMPTY_FILTERS, filterRows, withSearch,
  type CollectionRow, type ColumnKey, type Filters,
} from "@/lib/modules/collection/view-model";
import type { WaTemplate } from "@/lib/modules/collection/wa-message";
import { useViewState } from "@/lib/ui/view-state";
import { findTarget } from "@/lib/modules/collection/payment-history";
import { PaymentHistoryModal, type PayHistTarget } from "@/components/payment-history-modal";
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
  preferred: string | null; // Collection Name akun (opsional): collection awal bila ada di aging
  canPayHist?: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const aging = useDataset("aging");
  const activity = useDataset("activity");
  const settings = useDataset("settings");
  const remarks = useRemarks();
  // Pengaturan (template WA, waktu update) dari dataset lokal — halaman server tanpa query tambahan.
  const lastUpdate = (settings.data?.last_tagihan_update as string | undefined) ?? aging.data?.uploadedAt ?? null;
  // Collection terpilih, filter, kolom & centang diingat selama tab terbuka: kembali dari menu lain (tanpa ?c=)
  // langsung ke collection & tampilan yang sama. Filter & centang disimpan per collection.
  // Semua akun ber-menu Daftar Tagihan melihat semua collection (keputusan user 2026-09-29).
  const [storedColl, setColl] = useViewState("collection:coll", "");
  const ar = useMemo(() => (aging.data ? arOf(aging.data.lines, settings.data ?? null) : []), [aging.data, settings.data]);
  const collections = useMemo(() => collectionSummary(ar), [ar]);
  const preferred = props.preferred && collections.some((c) => c.name === props.preferred) ? props.preferred : "";
  const coll = props.initial || storedColl || preferred;
  useEffect(() => {
    if (props.initial && props.initial !== storedColl) setColl(props.initial);
  }, [props.initial, storedColl, setColl]);
  const [filters, setFilters] = useViewState<Filters>(`collection:${coll}:filters`, EMPTY_FILTERS);
  const [columns, setColumns] = useViewState<ColumnKey[]>("collection:columns", DEFAULT_COLUMNS);
  const [selection, setSelection] = useViewState<string[]>(`collection:${coll}:sel`, []);

  // Hitungan dibagi antar halaman (lib/local/derived): tidak diulang saat kembali ke menu ini.
  const base = useMemo(() => (coll && activity.data ? collectionRowsOf(ar, activity.data, remarks.map, coll, todayJakarta()) : []),
    [ar, activity.data, coll, remarks.map]);

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
  // Tombol "Lihat History Pembayaran": hanya bila centang berasal dari satu BP (dan akun punya akses menunya).
  const [histTarget, setHistTarget] = useState<PayHistTarget | null>(null);
  const history = useMemo(() => {
    if (!props.canPayHist || !selectedRows.length) return undefined;
    const bps = new Set(selectedRows.map((r) => r.business_partner));
    if (bps.size > 1) return "multi" as const;
    const t = aging.data ? findTarget([...bps][0], aging.data.lines) : null;
    return t ?? ("none" as const);
  }, [props.canPayHist, selectedRows, aging.data]);

  function pick(name: string) {
    // Ganti collection: filter & centang tersimpan per collection (kembali ke collection lama = tampilan lama).
    setColl(name);
    router.replace(name ? `/collection?c=${encodeURIComponent(name)}` : "/collection");
  }

  if (!coll) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-medium">Collection</h1>
        <p className="mt-1 text-sm text-fg-2">Pilih collection. Data per: {fmtTimestamp(lastUpdate)}</p>
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
        <select value={coll} onChange={(e) => pick(e.target.value)} className={`${inputCls} !w-auto text-base font-medium`} aria-label="Collection">
          {collections.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <span className="text-xs text-fg-2">Data per: {fmtTimestamp(lastUpdate)}</span>
        <button type="button" className={`${btnGhost} relative ml-auto`} onClick={reload} disabled={loading}>
          <span className="material-symbols-outlined">refresh</span>
          Refresh
        </button>
      </div>

      <KpiPanel rows={rows} filters={filters} setFilters={setFilters} loading={loading} collection={coll} />
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
        key={coll}
        scrollKey={`collection:${coll}:scroll`}
        rows={filtered}
        columns={columns}
        loading={loading}
        selection={selection}
        setSelection={setSelection}
        onEditKeterangan={(row) => {
          const inv = row.invoice_no, current = row.keterangan;
          const text = window.prompt(`Keterangan ${row.no_sj || inv} (terikat No SJ — sama dengan Mitra10 & Hold Faktur Pajak):`, current);
          if (text === null) return;
          patch([inv], (r) => withSearch({ ...r, keterangan: text.trim() }));
          setRemarks([{ no_sj: row.no_sj, invoice_no: inv }], text, "collection").catch(() => patch([inv], (r) => withSearch({ ...r, keterangan: current })));
        }}
      />

      <ActionBar
        collection={coll}
        selected={selectedRows}
        columns={columns}
        clear={() => setSelection([])}
        patch={patch}
        serverTemplate={(settings.data?.wa_template as Partial<WaTemplate> | undefined) ?? null}
        history={history}
        onHistory={setHistTarget}
      />
      <PaymentHistoryModal target={histTarget} onClose={() => setHistTarget(null)} />
    </div>
  );
}

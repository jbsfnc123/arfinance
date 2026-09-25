"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtDate, monthLabel } from "@/lib/format";
import {
  COLUMN_DEFS, EMPTY_FILTERS, optionCounts,
  type CollectionRow, type ColumnKey, type Filters,
} from "@/lib/modules/collection/view-model";
import { btnGhost, inputCls } from "@/components/ui";


export function FilterBar(props: {
  rows: CollectionRow[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  columns: ColumnKey[];
  setColumns: (c: ColumnKey[]) => void;
  shown: number;
}) {
  const { rows, filters, setFilters } = props;
  const [search, setSearch] = useState(filters.search);
  const [colMenu, setColMenu] = useState(false);

  // Pencarian ditunda 250 ms seperti versi lama.
  useEffect(() => {
    if (search === filters.search) return;
    const t = setTimeout(() => setFilters({ ...filters, search }), 250);
    return () => clearTimeout(t);
  }, [search, filters, setFilters]);

  const pgOptions = useMemo(() => optionCounts(rows, filters, "pg"), [rows, filters]);
  const bpOptions = useMemo(() => optionCounts(rows, filters, "bp"), [rows, filters]);

  const chips: { label: string; clear: Partial<Filters> }[] = [];
  if (filters.pg) chips.push({ label: `PG: ${filters.pg}`, clear: { pg: "" } });
  if (filters.aging) chips.push({ label: `Aging: ${filters.aging}`, clear: { aging: "" } });
  if (filters.category) chips.push({ label: `Status: ${filters.category}`, clear: { category: "" } });
  if (filters.bp) chips.push({ label: `Partner: ${filters.bp}`, clear: { bp: "" } });
  if (filters.due !== null) {
    chips.push({ label: `Bulan JT: ${filters.due === "__KOSONG__" ? "Tanpa Tanggal" : monthLabel(filters.due)}`, clear: { due: null } });
  }
  if (filters.dateFrom || filters.dateTo) {
    const range = filters.dateFrom && filters.dateTo
      ? `${fmtDate(filters.dateFrom)} — ${fmtDate(filters.dateTo)}`
      : filters.dateFrom ? `dari ${fmtDate(filters.dateFrom)}` : `s/d ${fmtDate(filters.dateTo)}`;
    chips.push({ label: `Tgl Invoice: ${range}`, clear: { dateFrom: "", dateTo: "" } });
  }

  const toggleColumn = (key: ColumnKey) => {
    const next = props.columns.includes(key) ? props.columns.filter((c) => c !== key) : [...props.columns, key];
    // Urutan kolom selalu mengikuti COLUMN_DEFS.
    props.setColumns(COLUMN_DEFS.map((c) => c.key).filter((k) => next.includes(k)));
  };

  return (
    <div className="sticky top-0 z-10 -mx-6 mt-4 border-b border-line bg-bg/95 px-6 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <span className="material-symbols-outlined absolute left-2.5 top-2 text-fg-2">search</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari invoice, BP, catatan…" className={`${inputCls} pl-9`} />
        </div>
        <select value={filters.pg} onChange={(e) => setFilters({ ...filters, pg: e.target.value })} className={`${inputCls} !w-auto max-w-56`}>
          <option value="">Semua Payment Group ({pgOptions.length})</option>
          {pgOptions.map(([v, n]) => <option key={v} value={v}>{v} ({n})</option>)}
        </select>
        <select value={filters.bp} onChange={(e) => setFilters({ ...filters, bp: e.target.value })} className={`${inputCls} !w-auto max-w-64`}>
          <option value="">Semua Business Partner ({bpOptions.length})</option>
          {bpOptions.map(([v, n]) => <option key={v} value={v}>{v} ({n})</option>)}
        </select>
        <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} className={`${inputCls} !w-auto`} title="Invoice date dari" />
        <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} className={`${inputCls} !w-auto`} title="Invoice date sampai" />
        <div className="relative">
          <button type="button" className={btnGhost} onClick={() => setColMenu(!colMenu)}>
            <span className="material-symbols-outlined">view_column</span>
            Kolom
          </button>
          {colMenu && (
            <div className="absolute right-0 z-20 mt-1 w-60 rounded-xl border border-line bg-surface p-2 shadow-lg" onMouseLeave={() => setColMenu(false)}>
              {COLUMN_DEFS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-surface-2">
                  <input type="checkbox" checked={props.columns.includes(c.key)} onChange={() => toggleColumn(c.key)} />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <span className="ml-auto text-xs text-fg-2">
          {props.shown.toLocaleString("id-ID")} dari {rows.length.toLocaleString("id-ID")} invoice
        </span>
      </div>

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <span key={c.label} className="inline-flex items-center gap-1 rounded-full bg-pill px-3 py-1 text-xs text-pill-fg">
              {c.label}
              <button type="button" onClick={() => setFilters({ ...filters, ...c.clear })} aria-label={`Hapus filter ${c.label}`}>
                <span className="material-symbols-outlined !text-sm">close</span>
              </button>
            </span>
          ))}
          <button type="button" className="text-xs text-accent hover:underline" onClick={() => { setSearch(""); setFilters(EMPTY_FILTERS); }}>
            Hapus semua filter
          </button>
        </div>
      )}
    </div>
  );
}

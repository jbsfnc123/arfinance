"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtDate, monthLabel } from "@/lib/format";
import {
  COLUMN_DEFS, EMPTY_FILTERS, optionCounts,
  type CollectionRow, type ColumnKey, type Filters,
} from "@/lib/modules/collection/view-model";
import { btnGhost, inputCls } from "@/components/ui";
import { Icon } from "@/components/icons";


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
  // Filter bisa berubah dari luar (dipulihkan dari state tersimpan / tombol reset) → kotak cari ikut.
  const [seen, setSeen] = useState(filters.search);
  if (filters.search !== seen) { setSeen(filters.search); setSearch(filters.search); }
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
    <div className="sticky top-0 z-10 -mx-4 mt-4 border-b border-separator bg-bg/90 px-4 py-2.5 backdrop-blur-xl md:-mx-6 md:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full min-w-56 flex-1 sm:w-auto">
          <Icon name="search" size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari invoice, BP, catatan…" aria-label="Cari invoice, BP, catatan" className={`${inputCls} pl-8`} />
        </div>
        <select value={filters.pg} onChange={(e) => setFilters({ ...filters, pg: e.target.value })} className={`${inputCls} max-w-none sm:!w-auto sm:max-w-56`} aria-label="Payment Group">
          <option value="">Semua Payment Group ({pgOptions.length})</option>
          {pgOptions.map(([v, n]) => <option key={v} value={v}>{v} ({n})</option>)}
        </select>
        <select value={filters.bp} onChange={(e) => setFilters({ ...filters, bp: e.target.value })} className={`${inputCls} max-w-none sm:!w-auto sm:max-w-64`} aria-label="Business Partner">
          <option value="">Semua Business Partner ({bpOptions.length})</option>
          {bpOptions.map(([v, n]) => <option key={v} value={v}>{v} ({n})</option>)}
        </select>
        <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} className={`${inputCls} !w-auto`} title="Invoice date dari" />
        <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} className={`${inputCls} !w-auto`} title="Invoice date sampai" />
        <div className="relative">
          <button type="button" className={btnGhost} onClick={() => setColMenu(!colMenu)} aria-expanded={colMenu}>
            <Icon name="view_column" size={16} />
            Kolom
          </button>
          {colMenu && (
            <div className="glass drop-in absolute right-0 z-(--z-popover) mt-1 w-60 rounded-[14px] p-1.5" onMouseLeave={() => setColMenu(false)}>
              {COLUMN_DEFS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 rounded-[8px] px-2 py-1 text-[13px] hover:bg-fg/8">
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
                <Icon name="close" size={14} />
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

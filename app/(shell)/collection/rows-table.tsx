"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { rupiah } from "@/lib/format";
import { cellText, COLUMN_DEFS, type CollectionRow, type CollectionSort, type ColumnKey } from "@/lib/modules/collection/view-model";
import { useFillHeight } from "@/lib/ui/fill-height";
import { useScrollMemory } from "@/lib/ui/view-state";
import { btnGhost, card } from "@/components/ui";
import { Icon } from "@/components/icons";

const ROW_HEIGHT = 40;

const WIDTH: Partial<Record<ColumnKey, number>> = {
  business_partner: 260, invoice_no: 170, payment_group: 200, marketing: 170,
  open_amt: 140, aging: 150, keterangan: 260,
};

const AGING_BADGE: Record<string, string> = {
  "Belum Jatuh Tempo": "bg-success/15 text-success",
  "1-30 Hari": "bg-warning/15 text-warning",
  "31-60 Hari": "bg-orange-400/15 text-orange-300",
  ">60 Hari": "bg-danger/15 text-danger",
};

export function RowsTable(props: {
  rows: CollectionRow[];
  columns: ColumnKey[];
  loading: boolean;
  selection: string[];
  setSelection: (fn: (prev: string[]) => string[]) => void;
  onEditKeterangan?: (row: CollectionRow) => void;
  scrollKey?: string; // posisi scroll diingat selama tab terbuka
  // Header seperti LocalTable (Mitra10): klik = urut naik → turun → normal; ikon mata = sembunyikan kolom.
  sort?: CollectionSort;
  onSort?: (key: ColumnKey) => void;
  onHide?: (key: ColumnKey) => void;
}) {
  const { rows, columns, selection, setSelection } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => new Set(selection), [selection]);
  const drag = useRef<boolean | null>(null); // mode seret: true = centang, false = hapus centang
  const [wrap, setWrap] = useState(false);
  useFillHeight(scrollRef, { reserve: 48, min: 280 });
  useScrollMemory(scrollRef, props.scrollKey ?? "collection:scroll", !props.loading && rows.length > 0); // 48 = baris status di bawah tabel + tepi kartu

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
    getItemKey: (i) => rows[i].invoice_no,
  });

  useEffect(() => {
    const end = () => { drag.current = null; };
    window.addEventListener("mouseup", end);
    return () => window.removeEventListener("mouseup", end);
  }, []);

  const setChecked = (inv: string, checked: boolean) =>
    setSelection((prev) => {
      const has = prev.includes(inv);
      if (checked && !has) return [...prev, inv];
      if (!checked && has) return prev.filter((x) => x !== inv);
      return prev;
    });

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.invoice_no));
  const toggleAll = () =>
    setSelection((prev) => {
      if (allChecked) {
        const visible = new Set(rows.map((r) => r.invoice_no));
        return prev.filter((x) => !visible.has(x));
      }
      const next = [...prev];
      for (const r of rows) if (!selected.has(r.invoice_no)) next.push(r.invoice_no);
      return next;
    });

  const cols = COLUMN_DEFS.filter((c) => columns.includes(c.key));
  const items = virtualizer.getVirtualItems();
  const padTop = items[0]?.start ?? 0;
  const padBottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0);

  return (
    <div className={`${card} mt-3 overflow-hidden`}>
      <div ref={scrollRef} className="overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-[1] bg-surface/90 backdrop-blur">
            <tr>
              <th className="w-12 border-b border-hairline px-3 py-2 text-left">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Pilih semua baris" />
              </th>
              {cols.map((c) => {
                const active = props.sort?.k === c.key ? props.sort.dir : 0;
                return (
                  <th
                    key={c.key}
                    style={{ minWidth: WIDTH[c.key] ?? 120 }}
                    onClick={props.onSort ? () => props.onSort!(c.key) : undefined}
                    aria-sort={active === 1 ? "ascending" : active === -1 ? "descending" : undefined}
                    title={props.onSort ? "Klik untuk mengurutkan" : undefined}
                    className={`group relative whitespace-nowrap border-b border-hairline py-2 text-xs font-medium text-fg-2 ${props.onHide ? "pl-3 pr-7" : "px-3"} ${props.onSort ? "cursor-pointer select-none hover:text-fg" : ""} ${c.money ? "text-right" : "text-left"}`}
                  >
                    {c.label}
                    {active === 1 && " ▲"}
                    {active === -1 && " ▼"}
                    {props.onHide && cols.length > 1 && (
                      <button type="button" title={`Sembunyikan kolom ${c.label}`} aria-label={`Sembunyikan kolom ${c.label}`}
                        onClick={(e) => { e.stopPropagation(); props.onHide!(c.key); }}
                        className="absolute right-1.5 top-1/2 inline-flex -translate-y-1/2 text-fg-2 opacity-0 hover:text-fg focus:opacity-100 group-hover:opacity-100">
                        <Icon name="visibility_off" size={14} />
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {padTop > 0 && <tr aria-hidden><td colSpan={cols.length + 1} style={{ height: padTop, padding: 0 }} /></tr>}
            {items.map((v) => {
              const r = rows[v.index];
              const isSel = selected.has(r.invoice_no);
              return (
                <tr
                  key={v.key}
                  data-index={v.index}
                  ref={virtualizer.measureElement}
                  style={{ height: ROW_HEIGHT }}
                  className={`select-none ${isSel ? "bg-accent/12" : "hover:bg-fg/[0.04]"}`}
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).closest("a,button")) return;
                    drag.current = !isSel;
                    setChecked(r.invoice_no, !isSel);
                  }}
                  onMouseEnter={() => {
                    if (drag.current !== null) setChecked(r.invoice_no, drag.current);
                  }}
                >
                  <td className="border-b border-hairline px-3">
                    <input type="checkbox" checked={isSel} readOnly aria-label={`Pilih ${r.invoice_no}`} className="pointer-events-none" />
                  </td>
                  {cols.map((c) => (
                    <td
                      key={c.key}
                      className={`border-b border-hairline px-3 ${wrap ? "max-w-md whitespace-normal break-words py-1.5" : "max-w-80 truncate"} ${c.money ? "text-right tabular-nums" : ""}`}
                      title={c.key === "keterangan" ? `${cellText(r, c.key)}${props.onEditKeterangan ? " — klik dua kali untuk mengubah" : ""}` : wrap || c.money ? undefined : cellText(r, c.key) || undefined}
                      onDoubleClick={c.key === "keterangan" && props.onEditKeterangan ? () => props.onEditKeterangan!(r) : undefined}
                    >
                      {c.key === "aging" ? (
                        r.aging === "-" ? "-" : <span className={`rounded-full px-2 py-0.5 text-xs ${AGING_BADGE[r.aging]}`}>{r.aging}</span>
                      ) : c.money ? rupiah(r.open_amt) : cellText(r, c.key)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {padBottom > 0 && <tr aria-hidden><td colSpan={cols.length + 1} style={{ height: padBottom, padding: 0 }} /></tr>}
          </tbody>
        </table>
        {!props.loading && rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-fg-2">Tidak ada data yang cocok dengan filter saat ini.</p>
        )}
        {props.loading && <p className="px-4 py-8 text-center text-sm text-fg-2">Memuat data…</p>}
      </div>
      <div className="flex items-center gap-3 border-t border-hairline px-4 py-2 text-xs text-fg-2">
        Menampilkan {rows.length.toLocaleString("id-ID")} baris (sesuai filter)
        <button type="button" className={`${btnGhost} !py-0.5 ${wrap ? "border-accent text-accent" : ""}`} aria-pressed={wrap}
          title="Tampilkan teks panjang secara utuh" onClick={() => setWrap(!wrap)}>
          <Icon name="wrap_text" size={16} />Teks penuh
        </button>
        {selection.length > 0 && (
          <button type="button" className="text-danger hover:underline" onClick={() => setSelection(() => [])}>
            Hapus semua pilihan ({selection.length})
          </button>
        )}
      </div>
    </div>
  );
}

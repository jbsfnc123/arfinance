"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Modal } from "@/components/modal";
import { btnGhost, inputCls } from "@/components/ui";
import { compareCells } from "@/lib/local/table";
import { downloadXlsx } from "@/lib/xlsx-client";

export type Col = { k: string; l: string; n?: boolean; link?: boolean; erpLink?: boolean };
export type TableRow = Record<string, unknown> & { sec?: boolean };
export type TableSpec = { title: string; rows: TableRow[]; cols: Col[]; noFoot?: boolean };

const ROW_H = 30;

// Tabel drill-down (port "Tabel modal" MarketPlace/index.html): urut klik header, cari, total kolom angka,
// SEMUA baris tampil (virtual scroll), export Excel baris hasil filter. Modal selebar hingga 96% layar.
export function DataTableModal(props: {
  spec: TableSpec | null;
  onClose: () => void;
  onLink?: (no: string) => void;
  onErpLink?: (no: string) => void;
}) {
  const { spec } = props;
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null);
  const [specSeen, setSpecSeen] = useState<TableSpec | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  if (spec !== specSeen) {
    setSpecSeen(spec);
    setQ("");
    setSort(null);
  }

  const rows = useMemo(() => {
    if (!spec) return [];
    const needle = q.toLowerCase();
    const out = needle ? spec.rows.filter((r) => spec.cols.some((c) => String(r[c.k] ?? "").toLowerCase().includes(needle))) : spec.rows.slice();
    if (sort) {
      const n = !!spec.cols.find((c) => c.k === sort.k)?.n;
      out.sort((a, b) => compareCells(a[sort.k], b[sort.k], n, sort.dir));
    }
    return out;
  }, [spec, q, sort]);

  const virt = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_H, overscan: 15 });

  if (!spec) return null;
  const items = virt.getVirtualItems();
  const padTop = items[0]?.start ?? 0;
  const padBottom = virt.getTotalSize() - (items.at(-1)?.end ?? 0);
  const span = spec.cols.length;

  async function exportXlsx() {
    await downloadXlsx(`${spec!.title.replace(/[\\/:*?"<>|]+/g, "_")}.xlsx`, spec!.title.replace(/[\\/:*?[\]]+/g, " ").slice(0, 31), [
      spec!.cols.map((c) => c.l),
      ...rows.map((r) => (r.sec ? [String(r.f ?? "")] : spec!.cols.map((c) => (r[c.k] as unknown) ?? ""))),
    ]);
  }

  const cell = (r: TableRow, c: Col) => {
    const v = r[c.k];
    if (c.n) return Math.round(Number(v) || 0).toLocaleString("id-ID");
    if (c.link && v && props.onLink) return <button type="button" className="text-accent hover:underline" onClick={() => props.onLink!(String(v))}>{String(v)}</button>;
    if (c.erpLink && v && props.onErpLink) return <button type="button" className="text-accent hover:underline" onClick={() => props.onErpLink!(String(v))}>{String(v)}</button>;
    return String(v ?? "");
  };

  return (
    <Modal open onClose={props.onClose} title={spec.title} xl>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari…" aria-label="Cari" className={`${inputCls} !w-64`} />
        <span className="ml-auto text-xs text-fg-2">{rows.length.toLocaleString("id-ID")} baris</span>
        <button type="button" className={btnGhost} onClick={exportXlsx}><span className="material-symbols-outlined !text-base">download</span>Excel</button>
      </div>
      <div ref={scrollRef} className="max-h-[65vh] overflow-auto rounded-lg border border-line">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-[1] bg-surface">
            <tr>
              {spec.cols.map((c) => (
                <th key={c.k} onClick={() => setSort({ k: c.k, dir: sort?.k === c.k ? (-sort.dir as 1 | -1) : 1 })}
                  className={`cursor-pointer whitespace-nowrap border-b border-line px-2 py-2 font-medium text-fg-2 ${c.n ? "text-right" : "text-left"}`}>
                  {c.l}{sort?.k === c.k ? (sort.dir > 0 ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {padTop > 0 && <tr aria-hidden><td colSpan={span} style={{ height: padTop, padding: 0 }} /></tr>}
            {items.map((vi) => {
              const r = rows[vi.index];
              return r.sec ? (
                <tr key={vi.key} data-index={vi.index} ref={virt.measureElement}>
                  <td colSpan={span} className="border-b border-line bg-surface-2 px-2 py-1.5 font-medium">{String(r.f ?? "")}</td>
                </tr>
              ) : (
                <tr key={vi.key} data-index={vi.index} ref={virt.measureElement} className="hover:bg-surface-2">
                  {spec.cols.map((c) => (
                    <td key={c.k} className={`border-b border-line/60 px-2 py-1.5 ${c.n ? "whitespace-nowrap text-right tabular-nums" : "max-w-md"} ${c.n && Number(r[c.k]) < 0 ? "text-danger" : ""}`}>{cell(r, c)}</td>
                  ))}
                </tr>
              );
            })}
            {padBottom > 0 && <tr aria-hidden><td colSpan={span} style={{ height: padBottom, padding: 0 }} /></tr>}
            {!rows.length && <tr><td colSpan={span} className="px-2 py-4 text-fg-2">Tidak ada data.</td></tr>}
          </tbody>
          {!spec.noFoot && rows.length > 0 && (
            <tfoot className="sticky bottom-0 bg-surface font-medium">
              <tr>
                {spec.cols.map((c, i) => (
                  <td key={c.k} className={`whitespace-nowrap border-t border-line px-2 py-1.5 ${c.n ? "text-right tabular-nums" : ""}`}>
                    {c.n ? Math.round(rows.reduce((a, r) => a + (Number(r[c.k]) || 0), 0)).toLocaleString("id-ID") : i === 0 ? "TOTAL" : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Modal>
  );
}

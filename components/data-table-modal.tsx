"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { btnGhost, inputCls } from "@/components/ui";

export type Col = { k: string; l: string; n?: boolean; link?: boolean; erpLink?: boolean };
export type TableRow = Record<string, unknown> & { sec?: boolean };
export type TableSpec = { title: string; rows: TableRow[]; cols: Col[]; noFoot?: boolean };

const LIMIT = 500;

// Tabel drill-down (port "Tabel modal" MarketPlace/index.html): urut klik header, cari,
// total kolom angka, maksimal 500 baris tampil, Export CSV semua baris hasil filter.
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
      out.sort((a, b) => {
        const x = a[sort.k] as string | number, y = b[sort.k] as string | number;
        return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
      });
    }
    return out;
  }, [spec, q, sort]);

  if (!spec) return null;

  function csv() {
    const quote = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const text = [spec!.cols.map((c) => quote(c.l)).join(","), ...rows.map((r) => spec!.cols.map((c) => quote(r[c.k])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" }));
    a.download = spec!.title.replace(/[^\w-]+/g, "_") + ".csv";
    a.click();
  }

  const cell = (r: TableRow, c: Col) => {
    const v = r[c.k];
    if (c.n) return Math.round(Number(v) || 0).toLocaleString("id-ID");
    if (c.link && v && props.onLink) return <button type="button" className="text-accent hover:underline" onClick={() => props.onLink!(String(v))}>{String(v)}</button>;
    if (c.erpLink && v && props.onErpLink) return <button type="button" className="text-accent hover:underline" onClick={() => props.onErpLink!(String(v))}>{String(v)}</button>;
    return String(v ?? "");
  };

  return (
    <Modal open onClose={props.onClose} title={spec.title} wide>
      <div className="mb-3 flex items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari…" className={inputCls} />
        <button type="button" className={btnGhost} onClick={csv}><span className="material-symbols-outlined">download</span>CSV</button>
      </div>
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface">
            <tr>
              {spec.cols.map((c) => (
                <th key={c.k} onClick={() => setSort({ k: c.k, dir: sort?.k === c.k ? (-sort.dir as 1 | -1) : 1 })}
                  className={`cursor-pointer whitespace-nowrap px-2 py-2 font-medium text-fg-2 ${c.n ? "text-right" : "text-left"}`}>
                  {c.l}{sort?.k === c.k ? (sort.dir > 0 ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, LIMIT).map((r, i) =>
              r.sec ? (
                <tr key={i}><td colSpan={spec.cols.length} className="bg-surface-2 px-2 py-1.5 font-medium">{String(r.f ?? "")}</td></tr>
              ) : (
                <tr key={i} className="border-t border-line">
                  {spec.cols.map((c) => (
                    <td key={c.k} className={`px-2 py-1.5 ${c.n ? "text-right tabular-nums" : ""} ${c.n && Number(r[c.k]) < 0 ? "text-danger" : ""}`}>{cell(r, c)}</td>
                  ))}
                </tr>
              ),
            )}
          </tbody>
          {!spec.noFoot && (
            <tfoot className="sticky bottom-0 bg-surface font-medium">
              <tr className="border-t border-line">
                {spec.cols.map((c, i) => (
                  <td key={c.k} className={`px-2 py-1.5 ${c.n ? "text-right" : ""}`}>
                    {c.n ? Math.round(rows.reduce((a, r) => a + (Number(r[c.k]) || 0), 0)).toLocaleString("id-ID") : i === 0 ? "TOTAL" : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="mt-2 text-xs text-fg-2">
        {rows.length.toLocaleString("id-ID")} baris{rows.length > LIMIT ? ` (tampil ${LIMIT}, gunakan pencarian / Export CSV untuk semua)` : ""}
      </p>
    </Modal>
  );
}

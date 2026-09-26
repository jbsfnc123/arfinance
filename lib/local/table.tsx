"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { fmtDate } from "@/lib/format";
import { parseNumber } from "@/lib/parsers/number";
import { downloadXlsx } from "@/lib/xlsx-client";
import { btnGhost, card, inputCls, th } from "@/components/ui";

// Tabel data lokal: semua baris sudah ada di browser, jadi filter/cari/sort/export instan.
// Virtual scroll untuk ribuan baris; sel bertanda `edit` bisa diubah langsung (Enter simpan, Esc batal).

export type LCol<T> = {
  k: keyof T & string; l: string; n?: boolean; d?: boolean; w?: number;
  badge?: Record<string, string>; edit?: "text" | "number" | "date";
};
export type LFilter<T> = { k: keyof T & string; l: string; options: string[] };

const ROW_H = 34;

// Kolom tersembunyi per tabel (localStorage, per browser). Dibaca lewat useSyncExternalStore agar aman untuk
// render server (snapshot server = null → semua kolom tampil).
const hiddenListeners = new Set<() => void>();
const readHidden = (k: string) => { try { return localStorage.getItem(`table:hidden:${k}`); } catch { return null; } };
function writeHidden(k: string, keys: string[]) {
  try { if (keys.length) localStorage.setItem(`table:hidden:${k}`, JSON.stringify(keys)); else localStorage.removeItem(`table:hidden:${k}`); } catch { /* opsional */ }
  hiddenListeners.forEach((fn) => fn());
}
const subscribeHidden = (fn: () => void) => { hiddenListeners.add(fn); return () => { hiddenListeners.delete(fn); }; };
function useHidden(key: string | undefined): [string[], (keys: string[]) => void] {
  const raw = useSyncExternalStore(subscribeHidden, () => (key ? readHidden(key) : null), () => null);
  const list = useMemo(() => { try { return raw ? (JSON.parse(raw) as string[]) : []; } catch { return []; } }, [raw]);
  return [list, (keys) => { if (key) writeHidden(key, keys); }];
}

function display<T>(r: T, c: LCol<T>) {
  const v = r[c.k] as unknown;
  if (c.n) return v === null || v === undefined || v === "" ? "" : Number(v).toLocaleString("id-ID");
  if (c.d) return fmtDate(v as string | null);
  return v === null || v === undefined ? "" : String(v);
}

export function LocalTable<T>(props: {
  title: string;
  rows: T[];
  cols: LCol<T>[];
  rowKey: (r: T) => string | number;
  search: (keyof T & string)[];
  filters?: LFilter<T>[];
  loading?: boolean;
  selectable?: boolean;
  actions?: (selected: T[], clear: () => void) => React.ReactNode;
  toolbar?: React.ReactNode;
  onEdit?: (row: T, key: keyof T & string, value: unknown) => void;
  onAdd?: () => void;
  onDelete?: (rows: T[]) => void;
  hideKey?: string; // aktifkan sembunyikan/tampilkan kolom dari header (disimpan per tabel)
}) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null);
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [editing, setEditing] = useState<{ id: string | number; k: string; v: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useHidden(props.hideKey);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  // Minimal satu kolom selalu tampil.
  const cols = useMemo(() => {
    const vis = props.cols.filter((c) => !hidden.includes(c.k));
    return vis.length ? vis : props.cols.slice(0, 1);
  }, [props.cols, hidden]);
  const hiddenCols = props.cols.filter((c) => !cols.includes(c));

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = props.rows.filter((r) =>
      Object.entries(f).every(([k, v]) => !v || String((r as Record<string, unknown>)[k] ?? "") === v) &&
      (!needle || props.search.some((k) => String(r[k] ?? "").toLowerCase().includes(needle))));
    if (sort) {
      const col = props.cols.find((c) => c.k === sort.k);
      out = [...out].sort((a, b) => {
        const x = (a as Record<string, unknown>)[sort.k], y = (b as Record<string, unknown>)[sort.k];
        const cmp = col?.n ? Number(x ?? 0) - Number(y ?? 0) : String(x ?? "").localeCompare(String(y ?? ""), "id");
        return cmp * sort.dir;
      });
    }
    return out;
  }, [props.rows, props.search, props.cols, q, f, sort]);

  const virt = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_H, overscan: 12 });
  const items = virt.getVirtualItems();
  const padTop = items[0]?.start ?? 0;
  const padBottom = virt.getTotalSize() - (items[items.length - 1]?.end ?? 0);

  const selected = props.rows.filter((r) => sel.has(props.rowKey(r)));
  const clear = () => setSel(new Set());
  const allSel = rows.length > 0 && rows.every((r) => sel.has(props.rowKey(r)));

  function commit() {
    if (!editing) return;
    const row = props.rows.find((r) => props.rowKey(r) === editing.id);
    const col = props.cols.find((c) => c.k === editing.k);
    setEditing(null);
    if (!row || !col || !props.onEdit) return;
    const raw = editing.v.trim();
    const value = raw === "" ? null : col.edit === "number" ? parseNumber(raw) : raw;
    if (String(row[col.k] ?? "") === String(value ?? "")) return;
    props.onEdit(row, col.k, value);
  }

  async function exportXlsx() {
    await downloadXlsx(`${props.title}.xlsx`, props.title.slice(0, 31), [
      cols.map((c) => c.l), ...rows.map((r) => cols.map((c) => (r[c.k] as unknown) ?? "")),
    ]);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari…" className={`${inputCls} !w-60`} />
        {props.filters?.map((fl) => (
          <select key={fl.k} value={f[fl.k] ?? ""} onChange={(e) => setF({ ...f, [fl.k]: e.target.value })} className={`${inputCls} !w-auto`}>
            <option value="">{fl.l}: semua</option>
            {fl.options.map((o) => <option key={o}>{o}</option>)}
          </select>
        ))}
        {props.toolbar}
        {props.selectable && selected.length > 0 && (
          <>
            {props.actions?.(selected, clear)}
            {props.onDelete && (
              <button type="button" className={btnGhost} onClick={() => { if (confirm(`Hapus ${selected.length} baris?`)) { props.onDelete!(selected); clear(); } }}>
                <span className="material-symbols-outlined !text-base">delete</span>Hapus {selected.length}
              </button>
            )}
          </>
        )}
        {props.hideKey && hiddenCols.length > 0 && (
          <span className="relative">
            <button type="button" className={btnGhost} onClick={() => setHiddenOpen(!hiddenOpen)} aria-expanded={hiddenOpen}>
              <span className="material-symbols-outlined !text-base">visibility</span>Kolom tersembunyi ({hiddenCols.length})
            </button>
            {hiddenOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 min-w-56 rounded-xl border border-line bg-surface p-1 shadow-lg">
                {hiddenCols.map((c) => (
                  <button key={c.k} type="button" onClick={() => setHidden(hidden.filter((k) => k !== c.k))}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2">
                    <span className="material-symbols-outlined !text-base text-fg-2">visibility</span>{c.l}
                  </button>
                ))}
                <button type="button" onClick={() => { setHidden([]); setHiddenOpen(false); }}
                  className="mt-1 w-full rounded-lg border-t border-line px-2 py-1.5 text-left text-sm text-accent hover:bg-surface-2">Tampilkan semua</button>
              </div>
            )}
          </span>
        )}
        <span className="ml-auto text-sm text-fg-2">{props.loading ? "Memuat…" : `${rows.length.toLocaleString("id-ID")} baris`}</span>
        {props.onAdd && (
          <button type="button" className={btnGhost} onClick={props.onAdd}><span className="material-symbols-outlined !text-base">add</span>Tambah baris</button>
        )}
        <button type="button" className={btnGhost} onClick={exportXlsx}><span className="material-symbols-outlined !text-base">download</span>Excel</button>
      </div>

      <div ref={scrollRef} className={`${card} h-[68vh] overflow-auto`}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr>
              {props.selectable && (
                <th className={`${th} w-8 border-b border-line`}>
                  <input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(rows.map(props.rowKey)))} />
                </th>
              )}
              {cols.map((c) => (
                <th key={c.k} onClick={() => setSort(sort?.k === c.k ? (sort.dir === 1 ? { k: c.k, dir: -1 } : null) : { k: c.k, dir: 1 })}
                  className={`${th} group cursor-pointer select-none border-b border-line ${c.n ? "text-right" : ""}`} style={{ minWidth: c.w }}>
                  {c.l}{c.edit && <span className="ml-1 text-accent" title="Bisa diedit">✎</span>}
                  {sort?.k === c.k && (sort.dir === 1 ? " ▲" : " ▼")}
                  {props.hideKey && cols.length > 1 && (
                    <button type="button" title={`Sembunyikan kolom ${c.l}`} aria-label={`Sembunyikan kolom ${c.l}`}
                      onClick={(e) => { e.stopPropagation(); setHidden([...hidden, c.k]); }}
                      className="ml-1 inline-flex align-middle text-fg-2 opacity-0 hover:text-fg focus:opacity-100 group-hover:opacity-100">
                      <span className="material-symbols-outlined !text-sm">visibility_off</span>
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {padTop > 0 && <tr><td style={{ height: padTop }} /></tr>}
            {items.map((vi) => {
              const r = rows[vi.index];
              const id = props.rowKey(r);
              return (
                <tr key={id} style={{ height: ROW_H }} className={`hover:bg-surface-2 ${sel.has(id) ? "bg-surface-2" : ""}`}>
                  {props.selectable && (
                    <td className="border-b border-line/50 px-3">
                      <input type="checkbox" checked={sel.has(id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} />
                    </td>
                  )}
                  {cols.map((c) => {
                    const isEdit = editing?.id === id && editing.k === c.k;
                    const v = r[c.k] as unknown;
                    return (
                      <td key={c.k}
                        onDoubleClick={() => c.edit && props.onEdit && setEditing({ id, k: c.k, v: v === null || v === undefined ? "" : String(v) })}
                        className={`whitespace-nowrap border-b border-line/50 px-3 ${c.n ? "text-right" : ""} ${c.edit && props.onEdit ? "cursor-text" : ""}`}
                        title={c.edit && props.onEdit ? "Klik dua kali untuk mengedit" : undefined}>
                        {isEdit ? (
                          <input autoFocus type={c.edit === "date" ? "date" : "text"} value={editing.v}
                            onChange={(e) => setEditing({ ...editing, v: e.target.value })}
                            onBlur={commit}
                            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(null); }}
                            className="w-full min-w-24 rounded border border-accent bg-surface-2 px-1 py-0.5 text-sm outline-none" />
                        ) : c.badge && typeof v === "string" ? (
                          <span className={`rounded-full px-2 py-0.5 text-xs ${c.badge[v] ?? "bg-surface-2"}`}>{v}</span>
                        ) : display(r, c)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {padBottom > 0 && <tr><td style={{ height: padBottom }} /></tr>}
            {!rows.length && <tr><td colSpan={cols.length + 1} className="px-3 py-4 text-fg-2">{props.loading ? "Memuat…" : "Tidak ada data."}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

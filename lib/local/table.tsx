"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { fmtDate } from "@/lib/format";
import { parseNumber } from "@/lib/parsers/number";
import { downloadXlsx } from "@/lib/xlsx-client";
import { useFillHeight } from "@/lib/ui/fill-height";
import { useScrollMemory, useViewState } from "@/lib/ui/view-state";
import { btnGhost, card, inputCls, th } from "@/components/ui";

// Tabel data standar: semua baris sudah ada di browser, jadi filter/cari/sort/export instan.
// Tinggi mengikuti sisa layar (satu scrollbar per halaman), virtual scroll dengan tinggi baris terukur,
// header sticky, sel terpotong bertooltip + mode "Teks penuh", baris total opsional.
// Sel bertanda `edit` bisa diubah langsung (Enter simpan, Esc batal).

export type LCol<T> = {
  k: keyof T & string; l: string; n?: boolean; d?: boolean; w?: number;
  badge?: Record<string, string>; edit?: "text" | "number" | "date";
  render?: (r: T) => React.ReactNode; // isi sel kustom (link, tombol, badge khusus)
  text?: (r: T) => string;             // teks untuk cari/tooltip/export bila berbeda dari nilai mentah
  sum?: boolean;                       // tampilkan total kolom (baris hasil filter) di footer
  wrap?: boolean;                      // kolom teks panjang: selalu dibungkus, lebar maks. 28rem
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

const isEmpty = (v: unknown) => v === null || v === undefined || v === "";

export function cellText<T>(r: T, c: LCol<T>): string {
  if (c.text) return c.text(r);
  const v = r[c.k] as unknown;
  if (c.n) return isEmpty(v) ? "" : Number(v).toLocaleString("id-ID");
  if (c.d) return fmtDate(v as string | null);
  return isEmpty(v) ? "" : String(v);
}

/** Urutan baris: kosong selalu di akhir (naik maupun turun); angka dibandingkan sebagai angka. */
export function compareCells(x: unknown, y: unknown, numeric: boolean, dir: 1 | -1) {
  const ex = isEmpty(x), ey = isEmpty(y);
  if (ex || ey) return ex === ey ? 0 : ex ? 1 : -1;
  const cmp = numeric ? Number(x) - Number(y) : String(x).localeCompare(String(y), "id", { numeric: true });
  return cmp * dir;
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
  stateKey?: string; // kunci state tampilan (cari/filter/urut/centang/scroll) yang diingat selama tab terbuka
  rowClass?: (r: T) => string;
  onRowClick?: (r: T) => void;
  emptyText?: string;
  fill?: boolean;      // default true: tinggi = sisa layar. false: pakai `maxHeight` (mis. di dalam modal)
  maxHeight?: string;  // kelas tinggi saat fill=false
  minHeight?: number;  // batas bawah tinggi saat fill (default 320)
  noExport?: boolean;
}) {
  // Cari, filter, urutan, centang, Teks penuh & posisi scroll diingat selama tab browser terbuka (pindah menu aman).
  const vk = `table:${props.stateKey ?? props.hideKey ?? props.title}`;
  const [q, setQ] = useViewState(`${vk}:q`, "");
  const [f, setF] = useViewState<Record<string, string>>(`${vk}:f`, {});
  const [sort, setSort] = useViewState<{ k: string; dir: 1 | -1 } | null>(`${vk}:sort`, null);
  const [sel, setSel] = useViewState<Set<string | number>>(`${vk}:sel`, new Set(), { set: true });
  const [editing, setEditing] = useState<{ id: string | number; k: string; v: string } | null>(null);
  const [wrapAll, setWrapAll] = useViewState(`${vk}:wrap`, false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollMemory(scrollRef, `${vk}:scroll`, !props.loading && props.rows.length > 0);
  const fill = props.fill ?? true;
  useFillHeight(scrollRef, { enabled: fill, min: props.minHeight ?? 320 });
  const [hidden, setHidden] = useHidden(props.hideKey);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  // Minimal satu kolom selalu tampil.
  const cols = useMemo(() => {
    const vis = props.cols.filter((c) => !hidden.includes(c.k));
    return vis.length ? vis : props.cols.slice(0, 1);
  }, [props.cols, hidden]);
  const hiddenCols = props.cols.filter((c) => !cols.includes(c));

  // Filter yang opsinya sudah tidak ada (data berubah) diabaikan, bukan menyembunyikan semua baris.
  const activeF = useMemo(() => Object.fromEntries(Object.entries(f).filter(([k, v]) =>
    v && props.filters?.find((fl) => fl.k === k)?.options.includes(v))), [f, props.filters]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const searchCols = props.search.map((k) => props.cols.find((c) => c.k === k));
    let out = props.rows.filter((r) =>
      Object.entries(activeF).every(([k, v]) => String((r as Record<string, unknown>)[k] ?? "") === v) &&
      (!needle || props.search.some((k, i) => {
        const c = searchCols[i];
        return (c?.text ? c.text(r) : String(r[k] ?? "")).toLowerCase().includes(needle);
      })));
    if (sort) {
      const col = props.cols.find((c) => c.k === sort.k);
      out = [...out].sort((a, b) => compareCells((a as Record<string, unknown>)[sort.k], (b as Record<string, unknown>)[sort.k], !!col?.n, sort.dir));
    }
    return out;
  }, [props.rows, props.search, props.cols, q, activeF, sort]);

  if (process.env.NODE_ENV !== "production" && props.rows.length) {
    const seen = new Set<string | number>();
    for (const r of props.rows) { const k = props.rowKey(r); if (seen.has(k)) { console.warn(`LocalTable "${props.title}": rowKey ganda`, k); break; } seen.add(k); }
  }

  const virt = useVirtualizer({
    count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_H, overscan: 12,
    getItemKey: (i) => props.rowKey(rows[i]),
  });
  const items = virt.getVirtualItems();
  const padTop = items[0]?.start ?? 0;
  const padBottom = virt.getTotalSize() - (items[items.length - 1]?.end ?? 0);

  const selected = props.rows.filter((r) => sel.has(props.rowKey(r)));
  const clear = () => setSel(new Set());
  const allSel = rows.length > 0 && rows.every((r) => sel.has(props.rowKey(r)));
  const sums = cols.some((c) => c.sum)
    ? Object.fromEntries(cols.filter((c) => c.sum).map((c) => [c.k, rows.reduce((a, r) => a + (Number(r[c.k]) || 0), 0)]))
    : null;
  const span = cols.length + (props.selectable ? 1 : 0);

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
      cols.map((c) => c.l),
      ...rows.map((r) => cols.map((c) => (c.text ? c.text(r) : (r[c.k] as unknown) ?? ""))),
    ]);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari…" aria-label={`Cari di ${props.title}`}
          className={`${inputCls} !w-44 xl:!w-60`} />
        {props.filters?.map((fl) => (
          <select key={fl.k} value={activeF[fl.k] ?? ""} onChange={(e) => setF({ ...f, [fl.k]: e.target.value })} className={`${inputCls} !w-auto`}
            aria-label={`Filter ${fl.l}`}>
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
        {(q || Object.keys(activeF).length > 0 || sort) && (
          <button type="button" className={`${btnGhost} text-accent`} title="Kosongkan pencarian, filter & urutan tabel ini"
            onClick={() => { setQ(""); setF({}); setSort(null); }}>
            <span className="material-symbols-outlined !text-base">filter_alt_off</span>Reset filter
          </button>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <span className="whitespace-nowrap text-sm text-fg-2">
            {props.loading ? "Memuat…" : rows.length === props.rows.length
              ? `${rows.length.toLocaleString("id-ID")} baris`
              : `${rows.length.toLocaleString("id-ID")} dari ${props.rows.length.toLocaleString("id-ID")} baris`}
          </span>
          <button type="button" className={`${btnGhost} ${wrapAll ? "border-accent text-accent" : ""}`} aria-pressed={wrapAll}
            title="Tampilkan teks panjang secara utuh (dibungkus ke beberapa baris)" onClick={() => setWrapAll(!wrapAll)}>
            <span className="material-symbols-outlined !text-base">wrap_text</span>Teks penuh
          </button>
          {props.onAdd && (
            <button type="button" className={btnGhost} onClick={props.onAdd}><span className="material-symbols-outlined !text-base">add</span>Tambah baris</button>
          )}
          {!props.noExport && (
            <button type="button" className={btnGhost} onClick={exportXlsx}><span className="material-symbols-outlined !text-base">download</span>Excel</button>
          )}
        </span>
      </div>

      <div ref={scrollRef} className={`${card} overflow-auto ${fill ? "" : props.maxHeight ?? "max-h-[70vh]"}`}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr>
              {props.selectable && (
                <th className={`${th} w-8 border-b border-line`}>
                  <input type="checkbox" checked={allSel} aria-label="Pilih semua baris"
                    onChange={() => setSel(allSel ? new Set() : new Set(rows.map(props.rowKey)))} />
                </th>
              )}
              {cols.map((c) => (
                <th key={c.k} onClick={() => setSort(sort?.k === c.k ? (sort.dir === 1 ? { k: c.k, dir: -1 } : null) : { k: c.k, dir: 1 })}
                  aria-sort={sort?.k === c.k ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
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
            {padTop > 0 && <tr aria-hidden><td colSpan={span} style={{ height: padTop, padding: 0 }} /></tr>}
            {items.map((vi) => {
              const r = rows[vi.index];
              const id = props.rowKey(r);
              return (
                <tr key={vi.key} data-index={vi.index} ref={virt.measureElement} style={{ height: ROW_H }}
                  onClick={props.onRowClick ? () => props.onRowClick!(r) : undefined}
                  className={`hover:bg-surface-2 ${sel.has(id) ? "bg-surface-2" : ""} ${props.onRowClick ? "cursor-pointer" : ""} ${props.rowClass?.(r) ?? ""}`}>
                  {props.selectable && (
                    <td className="border-b border-line/50 px-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={sel.has(id)} aria-label="Pilih baris"
                        onChange={() => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} />
                    </td>
                  )}
                  {cols.map((c) => {
                    const isEdit = editing?.id === id && editing.k === c.k;
                    const v = r[c.k] as unknown;
                    const text = cellText(r, c);
                    const wrap = wrapAll || c.wrap;
                    return (
                      <td key={c.k}
                        onDoubleClick={() => c.edit && props.onEdit && setEditing({ id, k: c.k, v: v === null || v === undefined ? "" : String(v) })}
                        className={`border-b border-line/50 px-3 ${wrap ? "min-w-40 max-w-md whitespace-normal break-words py-1.5" : "max-w-[28rem] truncate whitespace-nowrap"} ${c.n ? "text-right tabular-nums" : ""} ${c.edit && props.onEdit ? "cursor-text" : ""}`}
                        title={c.edit && props.onEdit ? `${text ? text + " — " : ""}klik dua kali untuk mengedit` : !wrap && text.length > 24 ? text : undefined}>
                        {isEdit ? (
                          <input autoFocus type={c.edit === "date" ? "date" : "text"} value={editing.v}
                            onChange={(e) => setEditing({ ...editing, v: e.target.value })}
                            onBlur={commit}
                            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(null); }}
                            className="w-full min-w-24 rounded border border-accent bg-surface-2 px-1 py-0.5 text-sm outline-none" />
                        ) : c.render ? c.render(r) : c.badge && typeof v === "string" ? (
                          <span className={`rounded-full px-2 py-0.5 text-xs ${c.badge[v] ?? "bg-surface-2"}`}>{v}</span>
                        ) : text}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {padBottom > 0 && <tr aria-hidden><td colSpan={span} style={{ height: padBottom, padding: 0 }} /></tr>}
            {!rows.length && <tr><td colSpan={span} className="px-3 py-4 text-fg-2">{props.loading ? "Memuat…" : props.emptyText ?? "Tidak ada data."}</td></tr>}
          </tbody>
          {sums && rows.length > 0 && (
            <tfoot className="sticky bottom-0 z-10 bg-surface font-medium">
              <tr>
                {props.selectable && <td className="border-t border-line" />}
                {cols.map((c, i) => (
                  <td key={c.k} className={`whitespace-nowrap border-t border-line px-3 py-2 ${c.n ? "text-right tabular-nums" : ""}`}>
                    {c.sum ? Math.round(sums[c.k]).toLocaleString("id-ID") : i === 0 ? "Total" : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

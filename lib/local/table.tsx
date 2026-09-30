"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { fmtDate } from "@/lib/format";
import { parseNumber } from "@/lib/parsers/number";
import { downloadXlsx } from "@/lib/xlsx-client";
import { useFillHeight } from "@/lib/ui/fill-height";
import { useDensity } from "@/lib/ui/prefs";
import { rowHeight } from "@/lib/ui/density";
import { useScrollMemory, useViewState } from "@/lib/ui/view-state";
import { btnGhost, card, inputCls, th } from "@/components/ui";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icons";

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

const ROW_H = 34; // Nyaman; Padat → rowHeight() (lib/ui/density.ts)

// Kolom tersembunyi per tabel (localStorage, per browser). Dibaca lewat useSyncExternalStore agar aman untuk
// render server (snapshot server = null → semua kolom tampil).
const hiddenListeners = new Set<() => void>();
const readHidden = (k: string) => { try { return localStorage.getItem(`table:hidden:${k}`); } catch { return null; } };
function writeHidden(k: string, keys: string[]) {
  // Selalu disimpan (termasuk []) agar "Tampilkan semua" tidak kembali ke kolom tersembunyi bawaan (defaultHidden).
  try { localStorage.setItem(`table:hidden:${k}`, JSON.stringify(keys)); } catch { /* opsional */ }
  hiddenListeners.forEach((fn) => fn());
}
const subscribeHidden = (fn: () => void) => { hiddenListeners.add(fn); return () => { hiddenListeners.delete(fn); }; };
function useHidden(key: string | undefined, defaults?: string[]): [string[], (keys: string[]) => void] {
  const raw = useSyncExternalStore(subscribeHidden, () => (key ? readHidden(key) : null), () => null);
  const def = (defaults ?? []).join("\u0000");
  const list = useMemo(() => {
    if (raw === null) return def ? def.split("\u0000") : []; // belum pernah diatur → kolom tersembunyi bawaan
    try { return JSON.parse(raw) as string[]; } catch { return []; }
  }, [raw, def]);
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

/**
 * Filter dinamis: opsi tiap filter dihitung dari baris yang lolos filter LAIN (+ pencarian), dengan jumlah baris.
 * Opsi terpilih tetap ada walau jumlahnya 0 agar bisa dikosongkan.
 */
export function filterOptions<T>(rows: T[], filters: LFilter<T>[], active: Record<string, string>, match: (r: T) => boolean) {
  const val = (r: T, k: string) => String((r as Record<string, unknown>)[k] ?? "");
  return filters.map((fl) => {
    const others = Object.entries(active).filter(([k]) => k !== fl.k);
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (!match(r) || !others.every(([k, v]) => val(r, k) === v)) continue;
      const v = val(r, fl.k);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const opts = fl.options.filter((o) => counts.has(o) || active[fl.k] === o).map((o) => ({ value: o, count: counts.get(o) ?? 0 }));
    return { ...fl, opts };
  });
}

/** N teratas (urutan sudah benar); `where` menyaring baris yang boleh masuk daftar N teratas. */
export function topRows<T>(rows: T[], limit: number, where?: (r: T) => boolean) {
  const out: T[] = [];
  for (const r of rows) { if (!where || where(r)) out.push(r); if (out.length >= limit) break; }
  return out;
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
  defaultHidden?: string[]; // kolom yang tersembunyi selama user belum mengatur sendiri
  stateKey?: string; // kunci state tampilan (cari/filter/urut/centang/scroll) yang diingat selama tab terbuka
  rowClass?: (r: T) => string;
  onRowClick?: (r: T) => void;
  emptyText?: string;
  fill?: boolean;      // default true: tinggi = sisa layar. false: pakai `maxHeight` (mis. di dalam modal)
  maxHeight?: string;  // kelas tinggi saat fill=false
  minHeight?: number;  // batas bawah tinggi saat fill (default 320)
  noExport?: boolean;
  defaultSort?: { k: string; dir: 1 | -1 }; // urutan bila user belum mengklik header
  defaultFilter?: Record<string, string>; // filter awal selama user belum mengatur sendiri (mis. Status = Belum TF)
  defaultLimit?: number;  // tampilkan N teratas selama cari/filter belum aktif (mis. 20 terlama)
  limitNote?: string;     // keterangan N teratas
  limitWhere?: (r: T) => boolean; // baris yang boleh masuk N teratas (mis. tanpa invoice telat > 365 hari)
  onRowsChange?: (rows: T[]) => void; // baris hasil cari/filter/urut (mis. KPI induk yang mengikuti tabel)
}) {
  // Cari, filter, urutan, centang, Teks penuh & posisi scroll diingat selama tab browser terbuka (pindah menu aman).
  const vk = `table:${props.stateKey ?? props.hideKey ?? props.title}`;
  const toast = useToast();
  const [q, setQ] = useViewState(`${vk}:q`, "");
  const [f, setF] = useViewState<Record<string, string>>(`${vk}:f`, props.defaultFilter ?? {});
  const [sort, setSort] = useViewState<{ k: string; dir: 1 | -1 } | null>(`${vk}:sort`, null);
  const toggleSort = (k: string) => setSort(sort?.k === k ? (sort.dir === 1 ? { k, dir: -1 } : null) : { k, dir: 1 });
  const [sel, setSel] = useViewState<Set<string | number>>(`${vk}:sel`, new Set(), { set: true });
  const [editing, setEditing] = useState<{ id: string | number; k: string; v: string } | null>(null);
  const [wrapAll, setWrapAll] = useViewState(`${vk}:wrap`, false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollMemory(scrollRef, `${vk}:scroll`, !props.loading && props.rows.length > 0);
  const fill = props.fill ?? true;
  useFillHeight(scrollRef, { enabled: fill, min: props.minHeight ?? 320 });
  const [hidden, setHidden] = useHidden(props.hideKey, props.defaultHidden);
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

  const matchSearch = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const searchCols = props.search.map((k) => props.cols.find((c) => c.k === k));
    return (r: T) => !needle || props.search.some((k, i) => {
      const c = searchCols[i];
      return (c?.text ? c.text(r) : String(r[k] ?? "")).toLowerCase().includes(needle);
    });
  }, [q, props.search, props.cols]);
  const dynFilters = useMemo(() => filterOptions(props.rows, props.filters ?? [], activeF, matchSearch),
    [props.rows, props.filters, activeF, matchSearch]);

  const [showAll, setShowAll] = useState(false);
  const allRows = useMemo(() => {
    let out = props.rows.filter((r) =>
      Object.entries(activeF).every(([k, v]) => String((r as Record<string, unknown>)[k] ?? "") === v) && matchSearch(r));
    const s = sort ?? props.defaultSort;
    if (s) {
      const col = props.cols.find((c) => c.k === s.k);
      out = [...out].sort((a, b) => compareCells((a as Record<string, unknown>)[s.k], (b as Record<string, unknown>)[s.k], !!col?.n, s.dir));
    }
    return out;
  }, [props.rows, props.cols, props.defaultSort, activeF, matchSearch, sort]);
  // N teratas hanya selama cari/filter belum aktif (dan "Tampilkan semua" belum diklik).
  const limited = !!props.defaultLimit && !showAll && !q.trim() && Object.keys(activeF).length === 0 &&
    (allRows.length > props.defaultLimit || (!!props.limitWhere && allRows.some((r) => !props.limitWhere!(r))));
  const { limitWhere, defaultLimit } = props;
  // Beri tahu induk baris yang sedang tampil (hasil cari/filter), mis. KPI per Username di Mitra10.
  // Hanya bila isinya berubah: allRows bisa dibuat ulang tiap render (mis. prop filters berupa array baru), dan induk yang
  // menyimpan baris ke state akan me-render ulang tabel → tanpa pembanding ini terjadi loop render tanpa akhir.
  const onRowsChange = useRef(props.onRowsChange);
  onRowsChange.current = props.onRowsChange;
  const reported = useRef<T[] | null>(null);
  useEffect(() => {
    const prev = reported.current;
    if (prev && prev.length === allRows.length && prev.every((r, i) => r === allRows[i])) return;
    reported.current = allRows;
    onRowsChange.current?.(allRows);
  }, [allRows]);
  const rows = useMemo(() => (limited ? topRows(allRows, defaultLimit!, limitWhere) : allRows), [limited, allRows, defaultLimit, limitWhere]);

  if (process.env.NODE_ENV !== "production" && props.rows.length) {
    const seen = new Set<string | number>();
    for (const r of props.rows) { const k = props.rowKey(r); if (seen.has(k)) { console.warn(`LocalTable "${props.title}": rowKey ganda`, k); break; } seen.add(k); }
  }

  const [density] = useDensity();
  const rowH = rowHeight(density, ROW_H);
  const virt = useVirtualizer({
    count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => rowH, overscan: 12,
    getItemKey: (i) => props.rowKey(rows[i]),
  });
  // Kepadatan berubah → ukur ulang semua baris agar posisi virtual tidak meleset.
  useEffect(() => { virt.measure(); }, [rowH, virt]);
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

  // Nama file & sheet dibersihkan di downloadXlsx; error ditampilkan (tidak diam).
  async function exportXlsx() {
    try {
      await downloadXlsx(`${props.title}.xlsx`, props.title, [
        cols.map((c) => c.l),
        ...allRows.map((r) => cols.map((c) => (c.text ? c.text(r) : (r[c.k] as unknown) ?? ""))),
      ]);
    } catch (e) {
      toast(`Gagal mengunduh Excel: ${(e as Error).message}`, "danger");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari…" aria-label={`Cari di ${props.title}`}
          className={`${inputCls} !w-44 xl:!w-60`} />
        {dynFilters.map((fl) => (
          <select key={fl.k} value={activeF[fl.k] ?? ""} onChange={(e) => setF({ ...f, [fl.k]: e.target.value })} className={`${inputCls} !w-auto max-w-64`}
            aria-label={`Filter ${fl.l}`}>
            <option value="">{fl.l}: semua ({fl.opts.length})</option>
            {fl.opts.map((o) => <option key={o.value} value={o.value}>{o.value} ({o.count.toLocaleString("id-ID")})</option>)}
          </select>
        ))}
        {props.toolbar}
        {props.selectable && selected.length > 0 && (
          <>
            {props.actions?.(selected, clear)}
            {props.onDelete && (
              <button type="button" className={btnGhost} onClick={() => { if (confirm(`Hapus ${selected.length} baris?`)) { props.onDelete!(selected); clear(); } }}>
                <Icon name="delete" size={16} />Hapus {selected.length}
              </button>
            )}
          </>
        )}
        {props.hideKey && hiddenCols.length > 0 && (
          <span className="relative">
            <button type="button" className={btnGhost} onClick={() => setHiddenOpen(!hiddenOpen)} aria-expanded={hiddenOpen}>
              <Icon name="visibility" size={16} />Kolom tersembunyi ({hiddenCols.length})
            </button>
            {hiddenOpen && (
              <div className="glass drop-in absolute left-0 top-full z-20 mt-1 min-w-56 rounded-[14px] p-1">
                {hiddenCols.map((c) => (
                  <button key={c.k} type="button" onClick={() => setHidden(hidden.filter((k) => k !== c.k))}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2">
                    <Icon name="visibility" size={16} className="text-fg-2" />{c.l}
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
            <Icon name="filter_alt_off" size={16} />Reset filter
          </button>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {limited && (
            <span className="text-sm text-fg-2">
              {props.limitNote ?? `${props.defaultLimit} teratas`} ·{" "}
              <button type="button" className="text-accent hover:underline" onClick={() => setShowAll(true)}>
                Tampilkan semua ({allRows.length.toLocaleString("id-ID")})
              </button>
            </span>
          )}
          {!limited && props.defaultLimit && showAll && !q.trim() && Object.keys(activeF).length === 0 && (
            <button type="button" className="text-sm text-accent hover:underline" onClick={() => setShowAll(false)}>
              Kembali ke {props.defaultLimit} teratas
            </button>
          )}
          <span className="whitespace-nowrap text-sm text-fg-2">
            {props.loading ? "Memuat…" : rows.length === props.rows.length
              ? `${rows.length.toLocaleString("id-ID")} baris`
              : `${rows.length.toLocaleString("id-ID")} dari ${props.rows.length.toLocaleString("id-ID")} baris`}
          </span>
          <button type="button" className={`${btnGhost} ${wrapAll ? "border-accent text-accent" : ""}`} aria-pressed={wrapAll}
            title="Tampilkan teks panjang secara utuh (dibungkus ke beberapa baris)" onClick={() => setWrapAll(!wrapAll)}>
            <Icon name="wrap_text" size={16} />Teks penuh
          </button>
          {props.onAdd && (
            <button type="button" className={btnGhost} onClick={props.onAdd}><Icon name="add" size={16} />Tambah baris</button>
          )}
          {!props.noExport && (
            <button type="button" className={btnGhost} onClick={exportXlsx}><Icon name="download" size={16} />Excel</button>
          )}
        </span>
      </div>

      <div ref={scrollRef} className={`${card} overflow-auto ${fill ? "" : props.maxHeight ?? "max-h-[70vh]"}`}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-surface/90 backdrop-blur">
            <tr>
              {props.selectable && (
                <th className={`${th} w-8 cursor-pointer border-b border-hairline pointer-coarse:min-w-11`} onClick={(e) => { if (e.target === e.currentTarget) setSel(allSel ? new Set() : new Set(rows.map(props.rowKey))); }}>
                  <input type="checkbox" checked={allSel} aria-label="Pilih semua baris"
                    onChange={() => setSel(allSel ? new Set() : new Set(rows.map(props.rowKey)))} />
                </th>
              )}
              {cols.map((c) => (
                <th key={c.k} onClick={() => toggleSort(c.k)}
                  aria-sort={sort?.k === c.k ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                  className={`${th} group cursor-pointer select-none border-b border-hairline hover:text-fg pointer-coarse:py-0 ${c.n ? "text-right" : ""}`} style={{ minWidth: c.w }}>
                  {/* Tombol agar urutkan bisa lewat keyboard (Enter/Spasi); klik area header tetap berfungsi. */}
                  <button type="button" onClick={(e) => { e.stopPropagation(); toggleSort(c.k); }}
                    aria-label={`Urutkan menurut ${c.l}`} className="inline-flex items-center gap-0.5 rounded-[4px] font-medium pointer-coarse:min-h-11 pointer-coarse:min-w-11">
                    {c.l}{c.edit && <span className="ml-1 inline-flex text-accent" title="Bisa diedit"><Icon name="edit" size={12} /></span>}
                    {sort?.k === c.k && <Icon name={sort.dir === 1 ? "expand_less" : "expand_more"} size={13} strokeWidth={2.25} className="text-accent" />}
                  </button>
                  {props.hideKey && cols.length > 1 && (
                    <button type="button" title={`Sembunyikan kolom ${c.l}`} aria-label={`Sembunyikan kolom ${c.l}`}
                      onClick={(e) => { e.stopPropagation(); setHidden([...hidden, c.k]); }}
                      className="ml-1 inline-flex align-middle text-fg-2 opacity-0 hover:text-fg focus:opacity-100 group-hover:opacity-100 pointer-coarse:h-11 pointer-coarse:w-11 pointer-coarse:items-center pointer-coarse:justify-center pointer-coarse:opacity-70">
                      <Icon name="visibility_off" size={14} />
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
                <tr key={vi.key} data-index={vi.index} ref={virt.measureElement} style={{ height: rowH }}
                  onClick={props.onRowClick ? () => props.onRowClick!(r) : undefined}
                  className={`${sel.has(id) ? "bg-selection hover:bg-selection-hover" : "hover:bg-fg/[0.04]"} ${props.onRowClick ? "cursor-pointer" : ""} ${props.rowClass?.(r) ?? ""}`}>
                  {props.selectable && (
                    <td className="cursor-pointer border-b border-hairline px-3" title="Pilih baris"
                      // Seluruh sel = area centang (target sentuh lebih besar tanpa mengubah tinggi baris virtual).
                      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }}>
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
                        className={`border-b border-hairline px-3 ${wrap ? "min-w-40 max-w-md whitespace-normal break-words py-1.5" : "max-w-[28rem] truncate whitespace-nowrap"} ${c.n ? "text-right tabular-nums" : ""} ${c.edit && props.onEdit ? "cursor-text" : ""}`}
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
            <tfoot className="sticky bottom-0 z-10 bg-surface/95 font-semibold backdrop-blur">
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

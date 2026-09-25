"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate } from "@/lib/format";
import { downloadXlsx } from "@/lib/xlsx-client";
import { btnGhost, card, inputCls, td, th } from "@/components/ui";

export type PCol = { k: string; l: string; n?: boolean; d?: boolean; badge?: Record<string, string> };
export type PFilter = { k: string; l: string; options: string[] };
type Row = Record<string, unknown>;

const PAGE = 200;

// Tabel view/tabel Supabase dengan filter, cari, paging server & export (pengganti tabel Excel + slicer).
export function PagedTable(props: {
  source: string;
  cols: PCol[];
  search: string[];
  filters?: PFilter[];
  order?: string;
  version: number;
  title: string;
  selectable?: boolean;
  rowKey?: string;
  actions?: (selected: Row[], clear: () => void) => React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [f, setF] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [sel, setSel] = useState<Map<string, Row>>(new Map());
  const idOf = (r: Row) => String(r[props.rowKey ?? "id"]);

  useEffect(() => {
    const t = setTimeout(() => { setQuery(q.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  function build(select: string) {
    // Nama tabel dinamis: tipe query dilonggarkan.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let req = (supabase.from(props.source as any) as any).select(select, { count: "exact" });
    for (const [k, v] of Object.entries(f)) if (v) req = req.eq(k, v);
    if (query) {
      const s = query.replace(/[%,()]/g, " ");
      req = req.or(props.search.map((c) => `${c}.ilike.%${s}%`).join(","));
    }
    return req.order(props.order ?? "id", { ascending: true });
  }

  useEffect(() => {
    build("*").range(page * PAGE, page * PAGE + PAGE - 1).then(({ data, count }: { data: Row[] | null; count: number | null }) => {
      setRows(data ?? []);
      setTotal(count ?? 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, f, page, props.version, props.source]);

  async function exportAll() {
    const out: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await build("*").range(from, from + 999);
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    await downloadXlsx(`${props.title}.xlsx`, props.title.slice(0, 31), [
      props.cols.map((c) => c.l),
      ...out.map((r) => props.cols.map((c) => r[c.k] ?? "")),
    ]);
  }

  const show = (r: Row, c: PCol) => {
    const v = r[c.k];
    if (c.n) return v === null || v === undefined || v === "" ? "" : Number(v).toLocaleString("id-ID");
    if (c.d) return fmtDate(v as string);
    if (c.badge && typeof v === "string") return <span className={`rounded-full px-2 py-0.5 text-xs ${c.badge[v] ?? "bg-surface-2"}`}>{v}</span>;
    return String(v ?? "");
  };

  const selected = [...sel.values()];
  const toggle = (r: Row) => {
    const m = new Map(sel);
    const id = idOf(r);
    if (m.has(id)) m.delete(id); else m.set(id, r);
    setSel(m);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari…" className={`${inputCls} !w-60`} />
        {props.filters?.map((fl) => (
          <select key={fl.k} value={f[fl.k] ?? ""} onChange={(e) => { setF({ ...f, [fl.k]: e.target.value }); setPage(0); }} className={`${inputCls} !w-auto`}>
            <option value="">{fl.l}: semua</option>
            {fl.options.map((o) => <option key={o}>{o}</option>)}
          </select>
        ))}
        {props.selectable && selected.length > 0 && props.actions?.(selected, () => setSel(new Map()))}
        <span className="ml-auto text-sm text-fg-2">{total.toLocaleString("id-ID")} baris</span>
        <button type="button" className={btnGhost} onClick={exportAll}><span className="material-symbols-outlined !text-base">download</span>Excel</button>
        <button type="button" className={btnGhost} disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
        <span className="text-sm text-fg-2">{page + 1}/{Math.max(1, Math.ceil(total / PAGE))}</span>
        <button type="button" className={btnGhost} disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>›</button>
      </div>
      <div className={`${card} max-h-[70vh] overflow-auto`}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-line">
              {props.selectable && <th className={th} />}
              {props.cols.map((c) => <th key={c.k} className={`${th} ${c.n ? "text-right" : ""}`}>{c.l}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={idOf(r) + i} className="border-b border-line/50 hover:bg-surface-2">
                {props.selectable && <td className={td}><input type="checkbox" checked={sel.has(idOf(r))} onChange={() => toggle(r)} /></td>}
                {props.cols.map((c) => <td key={c.k} className={`${td} ${c.n ? "text-right" : ""}`}>{show(r, c)}</td>)}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={props.cols.length + 1} className={`${td} text-fg-2`}>Tidak ada data.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

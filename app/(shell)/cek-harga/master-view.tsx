"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { btnGhost, card, inputCls, td, th } from "@/components/ui";

const PAGE = 50;

// Tabel MASTER (SO) dengan pencarian & halaman — dicari di server, bukan di browser.
export function MasterView() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Tables<"so_master">[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const t = setTimeout(() => { setQuery(q.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let req = supabase.from("so_master").select("*", { count: "exact" }).order("id").range(page * PAGE, page * PAGE + PAGE - 1);
    if (query) {
      const s = query.replace(/[%,()]/g, " ");
      req = req.or(`document_no.ilike.%${s}%,no_po_customer.ilike.%${s}%,business_partner.ilike.%${s}%,document_status.ilike.%${s}%`);
    }
    req.then(({ data, count }) => {
      setRows(data ?? []);
      setTotal(count ?? 0);
    });
  }, [page, query, supabase]);

  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <section className={`${card} overflow-hidden`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 text-sm">
        <span>{total.toLocaleString("id-ID")} baris SO</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari Document No, No PO, BP, status…" className={`${inputCls} ml-auto !w-72`} />
        <button type="button" className={btnGhost} disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Halaman sebelumnya">
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
        <span className="text-xs text-fg-2">{page + 1} / {pages}</span>
        <button type="button" className={btnGhost} disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Halaman berikutnya">
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {["Document No", "Date PO", "No PO Customer", "Business Partner", "Price List", "Document Status"].map((h) => <th key={h} className={th}>{h}</th>)}
              <th className={`${th} text-right`}>Grand Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className={td}>{r.document_no}</td>
                <td className={td}>{r.date_po}</td>
                <td className={td}>{r.no_po_customer}</td>
                <td className={`${td} max-w-64 truncate`}>{r.business_partner}</td>
                <td className={td}>{r.price_list}</td>
                <td className={td}>{r.document_status}</td>
                <td className={`${td} text-right`}>{Number(r.grand_total).toLocaleString("id-ID")}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className={`${td} text-fg-2`} colSpan={7}>Belum ada data MASTER. Upload SO terlebih dahulu.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

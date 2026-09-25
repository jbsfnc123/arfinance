"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtTimestamp } from "@/lib/format";
import { useToast } from "@/components/toast";
import { card, inputCls, td, th } from "@/components/ui";
import { LtkpPreview } from "../ltkp-preview";

type Row = {
  invoice_no: string; bp_value: string; request: string;
  ltkp: { no_ltkp: string; storage_path: string; created_at: string; created_by_name: string | null };
};

// Port Ltkp.html: cari dokumen LTKP berdasarkan No Invoice, No LTKP, atau BP_Value, lalu pratinjau PDF.
export function LtkpSearch() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState<{ path: string; title: string } | null>(null);

  useEffect(() => {
    supabase
      .from("tax_invoice_requests")
      .select("invoice_no, bp_value, request, ltkp:ltkp_documents!inner(no_ltkp, storage_path, created_at, created_by_name)")
      .order("id", { ascending: false })
      .limit(3000)
      .then(({ data, error }) => {
        if (error) toast(`Gagal memuat: ${error.message}`, "danger");
        setRows((data ?? []) as unknown as Row[]);
      });
  }, [supabase, toast]);

  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => !needle || `${r.invoice_no} ${r.ltkp.no_ltkp} ${r.bp_value}`.toLowerCase().includes(needle));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-2xl font-medium">LTKP</h1>
          <p className="text-sm text-fg-2">Laporan Tindakan Koreksi &amp; Pencegahan dari pengajuan pembatalan/revisi faktur.</p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari No Invoice, No LTKP, BP…" className={`${inputCls} !w-72`} autoFocus />
      </div>

      <section className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr><th className={th}>No LTKP</th><th className={th}>Invoice</th><th className={th}>BP_Value</th><th className={th}>Request</th><th className={th}>Diunggah</th></tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.invoice_no}-${i}`} className="border-t border-line">
                <td className={td}>
                  <button type="button" className="text-accent hover:underline" onClick={() => setPreview({ path: r.ltkp.storage_path, title: `LTKP ${r.ltkp.no_ltkp}` })}>
                    {r.ltkp.no_ltkp}
                  </button>
                </td>
                <td className={td}>{r.invoice_no}</td>
                <td className={`${td} max-w-64 truncate`} title={r.bp_value}>{r.bp_value}</td>
                <td className={td}>{r.request}</td>
                <td className={td}>{fmtTimestamp(r.ltkp.created_at)} <span className="text-xs text-fg-2">{r.ltkp.created_by_name}</span></td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td className={`${td} text-fg-2`} colSpan={5}>Tidak ada dokumen LTKP.</td></tr>}
          </tbody>
        </table>
      </section>

      <LtkpPreview path={preview?.path ?? null} title={preview?.title ?? ""} onClose={() => setPreview(null)} />
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { optimistic, useDataset } from "@/lib/local/store";

// Keterangan invoice BERSAMA: satu nilai per invoice yang sama di Collection, Mitra10 (Kertas Kerja)
// dan Hold Faktur Pajak (tabel invoice_remarks). Catatan collection baru ikut mengisinya (trigger DB).

export type RemarkSource = "collection" | "mitra10" | "hold" | "pengajuan";

export function useRemarks() {
  const ds = useDataset("remarks");
  const map = useMemo(() => new Map((ds.data?.remarks ?? []).map((r) => [r.invoice_no, r.keterangan])), [ds.data]);
  return { map, rows: ds.data?.remarks ?? [], loading: !ds.data && !ds.error, error: ds.error };
}

// Ubah keterangan (kosong = hapus): tampil seketika, disimpan ke server di belakang layar.
export function setRemarks(invoices: string[], text: string, source: RemarkSource) {
  const v = text.trim();
  const inv = [...new Set(invoices.filter(Boolean))];
  const now = new Date().toISOString();
  return optimistic("remarks", (d) => {
    const rest = d.remarks.filter((r) => !inv.includes(r.invoice_no));
    return { remarks: v ? [...rest, ...inv.map((invoice_no) => ({ invoice_no, keterangan: v, source, updated_at: now, updated_by_name: null }))] : rest };
  }, async () => {
    const { error } = await createClient().rpc("set_invoice_remark", { p_invoices: inv, p_text: v, p_source: source });
    if (error) throw error;
  });
}

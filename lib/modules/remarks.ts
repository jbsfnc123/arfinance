"use client";

import { useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { optimistic, useDataset } from "@/lib/local/store";

// Keterangan invoice BERSAMA (tabel invoice_remarks): satu nilai per No SJ, sama di Collection,
// Mitra10 (Kertas Kerja), Hold Faktur Pajak & Daftar Pengajuan. Diikat ke No SJ karena No Invoice
// bisa berubah saat revisi; invoice tanpa SJ memakai kunci "INV:<invoice>".

export type RemarkSource = "collection" | "mitra10" | "hold" | "pengajuan";
export type RemarkItem = { no_sj?: string | null; invoice_no?: string | null };

// Harus sama dengan private.remark_ref di database.
export function remarkKey(noSj: string | null | undefined, invoiceNo: string | null | undefined) {
  const sj = (noSj ?? "").trim();
  if (sj) return sj.toUpperCase();
  const inv = (invoiceNo ?? "").trim();
  return inv ? `INV:${inv.toUpperCase()}` : "";
}

export function useRemarks() {
  const ds = useDataset("remarks");
  const map = useMemo(() => new Map((ds.data?.remarks ?? []).map((r) => [r.ref, r.keterangan])), [ds.data]);
  const get = (noSj: string | null | undefined, invoiceNo: string | null | undefined) => map.get(remarkKey(noSj, invoiceNo)) ?? "";
  return { map, get, rows: ds.data?.remarks ?? [], loading: !ds.data && !ds.error, error: ds.error };
}

// Ubah keterangan (kosong = hapus): tampil seketika, disimpan ke server di belakang layar.
export function setRemarks(items: RemarkItem[], text: string, source: RemarkSource) {
  const v = text.trim();
  const byRef = new Map(items.map((i) => [remarkKey(i.no_sj, i.invoice_no), i] as const).filter(([k]) => k));
  const now = new Date().toISOString();
  return optimistic("remarks", (d) => {
    const rest = d.remarks.filter((r) => !byRef.has(r.ref));
    return {
      remarks: v ? [...rest, ...[...byRef].map(([ref, i]) => ({
        ref, no_sj: i.no_sj ?? null, invoice_no: i.invoice_no ?? null, keterangan: v, source, updated_at: now, updated_by_name: null,
      }))] : rest,
    };
  }, async () => {
    const payload = [...byRef.values()].map((i) => ({ no_sj: i.no_sj ?? null, invoice_no: i.invoice_no ?? null }));
    const { error } = await createClient().rpc("set_invoice_remark", { p_items: payload, p_text: v, p_source: source });
    if (error) throw error;
  });
}

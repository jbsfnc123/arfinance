// Hook penarikan otomatis arsip untuk halaman berpilihan bulan (Mutasi Bank, grafik alokasi KPI): bila bulan terpilih
// sudah dipindah ke Google Drive, datanya dimuat dari arsip lalu digabung ke dataset Supabase.
"use client";

import { useCallback, useMemo } from "react";
import type { Datasets, ErpInvoice, Mutation, Target } from "@/lib/local/datasets";
import type { ArchiveDataset } from "./datasets";
import { useArchivedRows, useArchiveList } from "./client";
import { erpFromPaymentRows, invoiceFromRow, mergeErp, mergeMutations, mergeTargets } from "./merge";

/** Bulan yang tersedia di arsip untuk dataset-dataset ini (gabungan, urut terbaru dulu). */
export function useArchiveMonths(datasets: ArchiveDataset[]) {
  const a = useArchiveList("erp_payments", datasets.includes("erp_payments"));
  const b = useArchiveList("ar_targets", datasets.includes("ar_targets"));
  const c = useArchiveList("bank_mutations", datasets.includes("bank_mutations"));
  return useMemo(() => [...new Set([...(a ?? []), ...(b ?? []), ...(c ?? [])].map((e) => e.period))].sort().reverse(), [a, b, c]);
}

type Erp = Datasets["erp"];

/**
 * Data satu bulan dari arsip, siap digabung: ERP (pembayaran bulan itu + invoice terbit bulan itu), target, mutasi.
 * `apply*` mengembalikan dataset Supabase yang sudah ditambah data arsip (atau dataset aslinya bila bulan tidak diarsip).
 */
export function useMonthArchive(month: string, want: { erp?: boolean; targets?: boolean; mutasi?: boolean }) {
  const months = useMemo(() => [month], [month]);
  const pay = useArchivedRows("erp_payments", months, !!want.erp);
  const inv = useArchivedRows("erp_invoices", months, !!want.erp);
  const tgt = useArchivedRows("ar_targets", months, !!want.targets);
  const mut = useArchivedRows("bank_mutations", months, !!want.mutasi);

  const erpExtra: Erp | null = useMemo(() => {
    if (!pay.rows.length && !inv.rows.length) return null;
    const e = erpFromPaymentRows(pay.rows);
    const have = new Set(e.invoices.map((i) => i.invoice_no));
    const more: ErpInvoice[] = inv.rows.map(invoiceFromRow).filter((i) => !have.has(i.invoice_no));
    return { invoices: [...e.invoices, ...more], payments: e.payments };
  }, [pay.rows, inv.rows]);

  const applyErp = useCallback(<T extends Erp>(base: T | null | undefined) => (base && erpExtra ? mergeErp(base, erpExtra) : base), [erpExtra]);
  const applyTargets = useCallback((base: Target[] | undefined) => (base && tgt.rows.length ? mergeTargets(base, tgt.rows) : base), [tgt.rows]);
  const applyMutations = useCallback(<T extends { mutations: Mutation[] }>(base: T | null | undefined) =>
    (base && mut.rows.length ? { ...base, mutations: mergeMutations(base.mutations, mut.rows) } : base), [mut.rows]);

  return {
    loading: (!!want.erp && (pay.loading || inv.loading)) || (!!want.targets && tgt.loading) || (!!want.mutasi && mut.loading),
    error: pay.error ?? inv.error ?? tgt.error ?? mut.error,
    fromArchive: pay.archived.length + inv.archived.length + tgt.archived.length + mut.archived.length > 0,
    applyErp, applyTargets, applyMutations,
  };
}

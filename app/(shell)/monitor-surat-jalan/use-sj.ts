"use client";

import { useMemo } from "react";
import { useDataset } from "@/lib/local/store";
import { todayJakarta } from "@/lib/parsers/date";
import { activeSet, applyVisibility, buildRows, filterChoices, filterRows, hiddenSets, receiverNames, type SjFilter } from "@/lib/modules/sj/compute";
import { useViewState } from "@/lib/ui/view-state";

// Data Monitor Surat Jalan di browser: SJ dari laporan Serah Terima + penerimaan tersimpan + daftar Receiver → satu baris per SJ.
// Tidak bergantung pada Aging (Fase 85). BP/Area yang tidak dicentang di Setting tidak tampil (Fase 86, bersama semua user).
// Dashboard & Kertas Kerja memakai filter periode/Area/Business Partner/Marketing Group yang SAMA (state bersama) sehingga angka selalu cocok.
export function useSj() {
  const ds = useDataset("sj");
  const today = todayJakarta();
  const data = ds.data;
  const recognized = useMemo(() => activeSet(data?.receivers ?? []), [data]);
  const rows = useMemo(() => (data ? buildRows(data.docs, data.receipts, recognized, today, receiverNames(data.receivers)) : []), [data, recognized, today]);
  const hidden = useMemo(() => hiddenSets(data?.hidden), [data]);
  const visible = useMemo(() => applyVisibility(rows, hidden), [rows, hidden]);
  const docKeys = useMemo(() => new Set((data?.docs ?? []).map((a) => a.sj_key)), [data]);
  const receiptKeys = useMemo(() => new Set((data?.receipts ?? []).map((r) => r.sj_key)), [data]);

  // Periode bawaan = semua periode (Dashboard per bulan menampilkan semua bulan). "" = tanpa batas.
  const [period, setPeriod] = useViewState<{ from: string; to: string }>("sj:period2", { from: "", to: "" });
  const [area, setArea] = useViewState("sj:area", "");
  const [bp, setBp] = useViewState("sj:bp", "");
  const [mg, setMg] = useViewState("sj:mg", "");
  const filter = useMemo<SjFilter>(() => ({ from: period.from, to: period.to, area, bp, mg }), [period, area, bp, mg]);
  const filtered = useMemo(() => filterRows(visible, filter), [visible, filter]);
  const choices = useMemo(() => filterChoices(visible, filter), [visible, filter]);

  return {
    ds, today, recognized, rows, visible, hidden, filtered, docKeys, receiptKeys, filter, choices,
    setPeriod: (from: string, to: string) => setPeriod({ from, to }),
    setArea,
    setBp,
    setMg,
    canManage: data?.canManage === true,
    lastUpload: data?.uploads[0] ?? null,
    docsAt: data?.docsAt ?? null,
    loading: ds.loading || (!data && !ds.error),
    error: ds.error,
  };
}
export type SjState = ReturnType<typeof useSj>;

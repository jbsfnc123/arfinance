"use client";

import { useMemo } from "react";
import { useDataset } from "@/lib/local/store";
import { todayJakarta } from "@/lib/parsers/date";
import { activeSet, buildRows, defaultPeriod, filterChoices, filterRows, receiverNames, type SjFilter } from "@/lib/modules/sj/compute";
import { useViewState } from "@/lib/ui/view-state";

// Data Monitor Surat Jalan di browser: SJ dari laporan Serah Terima + penerimaan tersimpan + daftar Receiver → satu baris per SJ.
// Tidak bergantung pada Aging (Fase 85). Dashboard & Kertas Kerja memakai filter periode/Area/Locator yang SAMA (state bersama) sehingga angka selalu cocok.
export function useSj() {
  const ds = useDataset("sj");
  const today = todayJakarta();
  const data = ds.data;
  const recognized = useMemo(() => activeSet(data?.receivers ?? []), [data]);
  const rows = useMemo(() => (data ? buildRows(data.docs, data.receipts, recognized, today, receiverNames(data.receivers)) : []), [data, recognized, today]);
  const docKeys = useMemo(() => new Set((data?.docs ?? []).map((a) => a.sj_key)), [data]);
  const receiptKeys = useMemo(() => new Set((data?.receipts ?? []).map((r) => r.sj_key)), [data]);
  const areas = useMemo(() => [...new Set(rows.map((r) => r.area ?? ""))].filter(Boolean).sort(), [rows]);

  // null = belum diatur user → periode bawaan (bulan Tanggal SJ terbaru). "" = semua.
  const [period, setPeriod] = useViewState<{ from: string; to: string } | null>("sj:period", null);
  const [area, setArea] = useViewState("sj:area", "");
  const [locator, setLocator] = useViewState("sj:locator", "");
  const dflt = useMemo(() => defaultPeriod(rows, today), [rows, today]);
  const from = period ? period.from : dflt.from, to = period ? period.to : dflt.to;
  const filter = useMemo<SjFilter>(() => ({ from, to, area, locator }), [from, to, area, locator]);
  const filtered = useMemo(() => filterRows(rows, filter), [rows, filter]);
  const choices = useMemo(() => filterChoices(rows, filter), [rows, filter]);

  return {
    ds, today, recognized, rows, filtered, docKeys, receiptKeys, areas, filter, choices,
    setPeriod: (from: string, to: string) => setPeriod({ from, to }),
    resetPeriod: () => setPeriod(null),
    setArea,
    setLocator,
    isDefaultPeriod: period === null,
    canManage: data?.canManage === true,
    lastUpload: data?.uploads[0] ?? null,
    docsAt: data?.docsAt ?? null,
    loading: ds.loading || (!data && !ds.error),
    error: ds.error,
  };
}
export type SjState = ReturnType<typeof useSj>;

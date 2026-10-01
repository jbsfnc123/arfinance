"use client";

import { useMemo } from "react";
import { useDataset } from "@/lib/local/store";
import { todayJakarta } from "@/lib/parsers/date";
import { activeSet, buildRows, defaultPeriod, filterRows, receiverNames, type SjFilter } from "@/lib/modules/sj/compute";
import { useViewState } from "@/lib/ui/view-state";

// Data Monitor Surat Jalan di browser: SJ aging terbaru + penerimaan tersimpan + daftar Receiver → satu baris per SJ.
// Dashboard & Kertas Kerja memakai filter periode/Area yang SAMA (state bersama) sehingga angka selalu cocok.
export function useSj() {
  const ds = useDataset("sj");
  const today = todayJakarta();
  const data = ds.data;
  const recognized = useMemo(() => activeSet(data?.receivers ?? []), [data]);
  const rows = useMemo(() => (data ? buildRows(data.aging, data.receipts, recognized, today, receiverNames(data.receivers)) : []), [data, recognized, today]);
  const agingKeys = useMemo(() => new Set((data?.aging ?? []).map((a) => a.sj_key)), [data]);
  const receiptKeys = useMemo(() => new Set((data?.receipts ?? []).map((r) => r.sj_key)), [data]);
  const areas = useMemo(() => [...new Set(rows.map((r) => r.area ?? ""))].filter(Boolean).sort(), [rows]);

  // null = belum diatur user → periode bawaan (bulan Invoice Date terbaru). "" = semua.
  const [period, setPeriod] = useViewState<{ from: string; to: string } | null>("sj:period", null);
  const [area, setArea] = useViewState("sj:area", "");
  const dflt = useMemo(() => defaultPeriod(rows, today), [rows, today]);
  const from = period ? period.from : dflt.from, to = period ? period.to : dflt.to;
  const filter = useMemo<SjFilter>(() => ({ from, to, area }), [from, to, area]);
  const filtered = useMemo(() => filterRows(rows, filter), [rows, filter]);

  return {
    ds, today, recognized, rows, filtered, agingKeys, receiptKeys, areas, filter,
    setPeriod: (from: string, to: string) => setPeriod({ from, to }),
    resetPeriod: () => setPeriod(null),
    setArea,
    isDefaultPeriod: period === null,
    canManage: data?.canManage === true,
    lastUpload: data?.uploads[0] ?? null,
    agingAt: data?.agingAt ?? null,
    loading: ds.loading || (!data && !ds.error),
    error: ds.error,
  };
}
export type SjState = ReturnType<typeof useSj>;

"use client";

import { useMemo } from "react";
import { useDataset } from "@/lib/local/store";
import { computeM10, m10AgingLines, TAX_DEFAULT } from "@/lib/modules/m10/compute";

// Data Mitra10 lengkap di browser: paket m10 + aging snapshot terkini + Tax Name,
// lalu semua kolom rumus dihitung lokal (dan ikut berubah seketika saat diedit).
export function useM10() {
  const m10 = useDataset("m10");
  const aging = useDataset("aging");
  const settings = useDataset("settings");
  const taxName = typeof settings.data?.m10_tax_name === "string" ? settings.data.m10_tax_name : TAX_DEFAULT;

  const agingLines = useMemo(() => (aging.data ? m10AgingLines(aging.data.lines, taxName) : []), [aging.data, taxName]);
  const computed = useMemo(() => (m10.data ? computeM10({ ...m10.data, aging: agingLines }) : null), [m10.data, agingLines]);

  return {
    computed,
    agingLines,
    schedule: m10.data?.schedule ?? [],
    taxName,
    lastAging: aging.data?.uploadedAt ?? null,
    loading: m10.loading || aging.loading || (!m10.data && !m10.error),
    error: m10.error ?? aging.error,
  };
}

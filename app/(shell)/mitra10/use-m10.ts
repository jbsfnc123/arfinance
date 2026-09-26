"use client";

import { useMemo } from "react";
import { useDataset } from "@/lib/local/store";
import { TAX_DEFAULT } from "@/lib/modules/m10/compute";
import { m10LinesOf, m10Of, m10ScopeOf, m10UsersOf } from "@/lib/local/derived";
import { useRemarks } from "@/lib/modules/remarks";

// Data Mitra10 lengkap di browser: paket m10 + aging snapshot terkini + Tax Name,
// lalu semua kolom rumus dihitung lokal (dan ikut berubah seketika saat diedit).
export function useM10() {
  const m10 = useDataset("m10");
  const aging = useDataset("aging");
  const settings = useDataset("settings");
  const remarks = useRemarks();
  const taxName = typeof settings.data?.m10_tax_name === "string" ? settings.data.m10_tax_name : TAX_DEFAULT;

  // Dibagi antar tab/halaman (memo global per versi data).
  const agingLines = useMemo(() => (aging.data ? m10LinesOf(aging.data.lines, taxName) : []), [aging.data, taxName]);
  // Dihitung setelah aging termuat — tanpa aging semua invoice akan terbaca "Lunas".
  const computed = useMemo(() => (m10.data && aging.data ? m10Of(m10.data, agingLines, remarks.map) : null), [m10.data, aging.data, agingLines, remarks.map]);

  const schedule = useMemo(() => m10.data?.schedule ?? [], [m10.data]);
  // Filter dashboard: Username (8 karakter kanan Payment Group).
  const filter = useMemo(() => ({
    label: "Username",
    options: computed ? m10UsersOf(computed, agingLines) : [],
    scope: (u: string) => (computed ? m10ScopeOf(computed, agingLines, schedule, u) : null),
  }), [computed, agingLines, schedule]);

  return {
    computed,
    filter,
    agingLines,
    schedule,
    taxName,
    lastAging: aging.data?.uploadedAt ?? null,
    loading: m10.loading || aging.loading || (!m10.data && !m10.error) || (!aging.data && !aging.error),
    error: m10.error ?? aging.error,
  };
}

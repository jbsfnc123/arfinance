"use client";

import { useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDataset } from "@/lib/local/store";
import { RKM_TAX_DEFAULT } from "@/lib/modules/rkm/compute";
import { rkmCabangsOf, rkmLinesOf, rkmOf, rkmScopeOf } from "@/lib/local/derived";
import { useRemarks } from "@/lib/modules/remarks";

let synced = false; // sekali per sesi browser

// Data RKM di browser: paket rkm + aging terkini (Tax Name) + Keterangan bersama; semua kolom
// rumus dihitung lokal. Saat dibuka, SJ baru di aging disinkronkan ke Kertas Kerja (rkm_sync).
export function useRkm() {
  const rkm = useDataset("rkm");
  const aging = useDataset("aging");
  const settings = useDataset("settings");
  const remarks = useRemarks();
  const taxName = typeof settings.data?.rkm_tax_name === "string" ? settings.data.rkm_tax_name : RKM_TAX_DEFAULT;

  useEffect(() => {
    if (synced) return;
    synced = true;
    createClient().rpc("rkm_sync").then(({ data }) => { if (Number(data) > 0) void rkm.reload(); });
  }, [rkm]);

  const agingLines = useMemo(() => (aging.data ? rkmLinesOf(aging.data.lines, taxName) : []), [aging.data, taxName]);
  // Dihitung setelah aging termuat — tanpa aging semua invoice akan terbaca "Lunas".
  const computed = useMemo(() => (rkm.data && aging.data ? rkmOf(rkm.data, agingLines, remarks.map) : null), [rkm.data, aging.data, agingLines, remarks.map]);

  // Filter dashboard: Cabang (dari nama Business Partner).
  const filter = useMemo(() => ({
    label: "Cabang",
    options: computed ? rkmCabangsOf(computed, agingLines) : [],
    scope: (c: string) => (computed ? rkmScopeOf(computed, agingLines, c) : null),
  }), [computed, agingLines]);

  return {
    computed,
    filter,
    agingLines,
    schedule: [],
    taxName,
    lastAging: aging.data?.uploadedAt ?? null,
    loading: rkm.loading || aging.loading || (!rkm.data && !rkm.error) || (!aging.data && !aging.error),
    error: rkm.error ?? aging.error,
  };
}

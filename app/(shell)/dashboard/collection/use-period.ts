"use client";
import { useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCachedQuery } from "@/lib/cache/cached-query";
import type { DatasetKey } from "@/lib/cache/versions";
import type { CollectionPeriod } from "@/lib/modules/collection/closing";

const OPEN: readonly DatasetKey[] = ["collection_closing", "aging", "targets", "activity", "erp", "settings"];
const CLOSED: readonly DatasetKey[] = ["collection_closing"];
const periodDeps = (data: CollectionPeriod) => data.status === "closed" ? CLOSED : OPEN;

export function useCollectionPeriod(month: string) {
  const client = useMemo(() => createClient(), []);
  const load = useCallback(async () => {
    const { data, error } = await client.rpc("collection_period_get", { p_month: month });
    if (error) throw error;
    return data as unknown as CollectionPeriod;
  }, [client, month]);
  // Catatan/Jadwal Bayar/tukar faktur bisa berubah beruntun: muat ulang otomatis digabung tiap 30 dtk (Refresh tetap langsung).
  const result = useCachedQuery(`collection-period:v2:${month}`, OPEN, load, { depsFor: periodDeps, liveDelayMs: 30_000 });
  return {
    ...result,
    data: result.data?.month === month ? result.data : null,
    error: result.error?.message ?? null,
    reload: () => result.reload(true),
  };
}

"use client";

import { useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { ensure, patchLocal, useDataset } from "@/lib/local/store";
import { useToast } from "@/components/toast";
import { applyFlags, flagErrorMessage, tandaOf, type RowFlagModule, type RowFlagValue } from "@/lib/modules/row-flags";

// Tanda LTKP / Litigasi per baris Kertas Kerja (Fase 82) — pola sama dengan use-row-marks: tampil seketika,
// disimpan lewat RPC row_flags_set (dicek hak menu di server); hanya respons TERBARU yang menentukan hasil akhir;
// gagal → data dimuat ulang dari server + pesan jelas.

const NAME = { m10: "m10Flags" } as const;
type Mod = keyof typeof NAME & RowFlagModule;
const latest: Record<Mod, number> = { m10: 0 };

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data?: unknown; error: { code?: string; message?: string } | null }>;

export async function commitFlags(opts: {
  module: Mod; ids: number[]; flag: RowFlagValue | null; rpc: Rpc;
  notify: (msg: string, type: "success" | "danger") => void;
}): Promise<boolean> {
  const { module, ids, flag, rpc, notify } = opts;
  if (!ids.length) return false;
  const name = NAME[module];
  const mine = ++latest[module];
  patchLocal(name, (d) => ({ flags: applyFlags(d.flags, ids, flag) }));
  let error: { code?: string; message?: string } | null;
  let data: unknown = null;
  try {
    ({ data, error } = await rpc("row_flags_set", { p_module: module, p_ids: ids, p_flag: flag }));
  } catch (e) {
    error = { message: (e as Error).message };
  }
  if (mine !== latest[module]) return !error;
  if (error) {
    await ensure(name, { force: true });
    notify(flagErrorMessage(error), "danger");
    return false;
  }
  // Fase 84: PO yang ada di Cek Selisih Harga ikut berubah (+ invoice lain dengan No PO sama) — di server.
  const synced = Number((data as { synced_pos?: number } | null)?.synced_pos ?? 0);
  const base = flag ? `Ditandai ${tandaOf(flag)} untuk ${ids.length} baris` : `${ids.length} baris dikembalikan ke Normal`;
  notify(synced ? `${base} · juga diterapkan ke ${synced} PO di Cek Selisih Harga` : base, "success");
  void ensure(name, { force: true });
  return true;
}

export function useRowFlags(module: Mod) {
  const ds = useDataset(NAME[module]);
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  const map = useMemo(() => new Map((ds.data?.flags ?? []).map((m) => [m.id, m.flag])), [ds.data]);
  const setFlags = useCallback((ids: number[], flag: RowFlagValue | null) => commitFlags({
    module, ids, flag,
    rpc: (fn, args) => supabase.rpc(fn as never, args as never) as unknown as ReturnType<Rpc>,
    notify: (msg, type) => toast(msg, type, type === "danger" ? 8000 : 3000),
  }), [module, supabase, toast]);
  return { map, setFlags, loading: !ds.data && !ds.error, error: ds.error };
}

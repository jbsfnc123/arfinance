import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Token versi dataset (tabel data_versions, dinaikkan trigger di database setiap ada
// upload/perubahan). Satu request ringan menggantikan query data yang berat.
export type DatasetKey =
  | "aging" | "erp" | "targets" | "activity" | "mutasi" | "m10" | "settings" | "deck" | "tukar" | "faktur" | "cekharga";

const MEMO_MS = 2000;
let memo: { at: number; map: Map<string, string> } | null = null;
let inflight: Promise<Map<string, string>> | null = null;
const listeners = new Set<(key: string) => void>();
let subscribed = false;

async function fetchAll(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase.from("data_versions").select("key, updated_at");
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.key, r.updated_at]));
}

// Satu realtime channel per tab: memo dibatalkan & pendengar diberi tahu saat versi berubah.
function subscribe(supabase: SupabaseClient<Database>) {
  if (subscribed || typeof window === "undefined") return;
  subscribed = true;
  supabase.channel("data-versions-cache")
    .on("postgres_changes", { event: "*", schema: "public", table: "data_versions" }, (p) => {
      memo = null;
      const key = (p.new as { key?: string })?.key;
      if (key) listeners.forEach((fn) => fn(key));
    })
    .subscribe();
}

export function makeToken(map: Map<string, string>, deps: readonly string[]) {
  return deps.map((k) => `${k}@${map.get(k) ?? "-"}`).join("|");
}

export async function getToken(supabase: SupabaseClient<Database>, deps: readonly string[]) {
  subscribe(supabase);
  if (!memo || Date.now() - memo.at > MEMO_MS) {
    inflight ??= fetchAll(supabase).finally(() => { inflight = null; });
    memo = { at: Date.now(), map: await inflight };
  }
  return makeToken(memo.map, deps);
}

export function onVersionChange(fn: (key: string) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

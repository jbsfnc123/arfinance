"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";
import { idbGet, idbPut } from "@/lib/cache/idb";
import { getToken, onVersionChange } from "@/lib/cache/versions";
import { DATASETS, type DatasetName, type Datasets } from "./datasets";

// Store data lokal (satu salinan per dataset untuk seluruh tab browser):
//   1. paket mentah disimpan di IndexedDB bersama token versi → buka menu berikutnya tanpa unduh ulang;
//   2. token berubah (upload/edit di mana pun) → paket diunduh ulang di belakang layar;
//   3. edit dari layar diterapkan ke store lebih dulu (optimistic), lalu dikirim ke server.

type Entry<K extends DatasetName> = {
  data: Datasets[K] | null; token: string | null; loading: boolean; error: Error | null; at: number | null; version: number;
};

const entries = new Map<DatasetName, Entry<DatasetName>>();
const listeners = new Map<DatasetName, Set<() => void>>();
const inflight = new Map<DatasetName, Promise<void>>();
const timers = new Map<DatasetName, ReturnType<typeof setTimeout>>();
let client: SupabaseClient<Database> | null = null;
let watching = false;

const sb = () => (client ??= createClient());
const empty = <K extends DatasetName>(): Entry<K> => ({ data: null, token: null, loading: false, error: null, at: null, version: 0 });

export function getEntry<K extends DatasetName>(name: K): Entry<K> {
  return (entries.get(name) as Entry<K>) ?? (empty() as Entry<K>);
}

function set<K extends DatasetName>(name: K, patch: Partial<Entry<K>>) {
  const prev = getEntry(name);
  entries.set(name, { ...prev, ...patch, version: prev.version + 1 } as Entry<DatasetName>);
  listeners.get(name)?.forEach((fn) => fn());
}

async function userKey(name: DatasetName) {
  const { data } = await sb().auth.getSession();
  return `${data.session?.user.id ?? "anon"}:ds:${name}`;
}

// Muat dataset: memori → IndexedDB (token sama) → unduh paket dari server.
export function ensure(name: DatasetName, opts: { force?: boolean } = {}): Promise<void> {
  const running = inflight.get(name);
  if (running && !opts.force) return running;
  const def = DATASETS[name];
  const p = (async () => {
    set(name, { loading: true, error: null });
    try {
      const token = await getToken(sb(), def.deps);
      const cur = getEntry(name);
      if (!opts.force && cur.data && cur.token === token) { set(name, { loading: false }); return; }
      const key = await userKey(name);
      if (!opts.force) {
        const hit = await idbGet<Record<string, unknown>>(key);
        if (hit && hit.token === token) {
          set(name, { data: def.decode(hit.data) as never, token, loading: false, at: hit.at });
          return;
        }
        // Data lama tetap ditampilkan selama versi baru diunduh.
        if (hit && !cur.data) set(name, { data: def.decode(hit.data) as never, token: hit.token, at: hit.at });
      }
      const { data, error } = await sb().rpc(def.rpc as never);
      if (error) throw error;
      const raw = (data ?? {}) as Record<string, unknown>;
      const at = Date.now();
      void idbPut(key, { token, data: raw, at }, JSON.stringify(raw).length);
      set(name, { data: def.decode(raw) as never, token, loading: false, at });
    } catch (e) {
      set(name, { loading: false, error: e as Error });
    } finally {
      inflight.delete(name);
    }
  })();
  inflight.set(name, p);
  return p;
}

// Versi dataset berubah di server → unduh ulang (ditunda 1,5 dtk supaya perubahan beruntun digabung).
function watch() {
  if (watching || typeof window === "undefined") return;
  watching = true;
  onVersionChange((key) => {
    for (const name of Object.keys(DATASETS) as DatasetName[]) {
      if (!DATASETS[name].deps.includes(key as never) || !entries.has(name)) continue;
      clearTimeout(timers.get(name));
      timers.set(name, setTimeout(() => { void ensure(name); }, 1500));
    }
  });
}

function subscribe(name: DatasetName, fn: () => void) {
  let s = listeners.get(name);
  if (!s) listeners.set(name, (s = new Set()));
  s.add(fn);
  return () => { s!.delete(fn); };
}

export function useDataset<K extends DatasetName>(name: K) {
  const entry = useSyncExternalStore(
    (fn) => subscribe(name, fn),
    () => getEntry(name),
    () => empty<K>(),
  ) as Entry<K>;
  useEffect(() => {
    watch();
    void ensure(name);
  }, [name]);
  return { ...entry, reload: () => ensure(name, { force: true }) };
}

// Ubah data lokal segera (optimistic) lalu jalankan panggilan server; gagal → kembalikan.
export async function optimistic<K extends DatasetName>(
  name: K, apply: (d: Datasets[K]) => Datasets[K], remote: () => Promise<unknown>,
) {
  const prev = getEntry(name).data;
  if (prev) set(name, { data: apply(prev) });
  try {
    return await remote();
  } catch (e) {
    set(name, { data: prev });
    throw e;
  }
}

// Ganti data lokal tanpa panggilan server (mis. menambal event realtime).
export function patchLocal<K extends DatasetName>(name: K, apply: (d: Datasets[K]) => Datasets[K]) {
  const cur = getEntry(name).data;
  if (cur) set(name, { data: apply(cur) });
}

// Dipakai tes & logout.
export function resetStore() {
  entries.clear();
  inflight.clear();
}

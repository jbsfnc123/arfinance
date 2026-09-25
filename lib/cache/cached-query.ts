"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";
import { idbDel, idbGet, idbMetas, idbPut, idbTouch } from "./idb";
import { getToken, onVersionChange, type DatasetKey } from "./versions";

// Cache data di browser berkunci token versi: bila token dataset sama dengan saat disimpan,
// data diambil dari IndexedDB tanpa query berat; bila berbeda, dimuat ulang sekali lalu disimpan.

export const MAX_ENTRY = 20 * 1024 * 1024;   // entri lebih besar tidak disimpan
export const MAX_TOTAL = 150 * 1024 * 1024;  // lewat batas → entri terlama dibuang

async function userId(supabase: SupabaseClient<Database>) {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? "anon";
}

async function evict() {
  const metas = (await idbMetas()).sort((a, b) => a.at - b.at);
  let total = metas.reduce((a, m) => a + m.size, 0);
  const drop: string[] = [];
  for (const m of metas) {
    if (total <= MAX_TOTAL) break;
    drop.push(m.key);
    total -= m.size;
  }
  if (drop.length) await idbDel(drop);
}

export type CachedResult<T> = { data: T; fromCache: boolean; token: string; at: number };

export async function cachedQuery<T>(
  supabase: SupabaseClient<Database>,
  opt: { key: string; deps: readonly DatasetKey[]; load: () => Promise<T>; force?: boolean },
): Promise<CachedResult<T>> {
  const k = `${await userId(supabase)}:${opt.key}`;
  const token = await getToken(supabase, opt.deps);
  if (!opt.force) {
    const hit = await idbGet<T>(k);
    if (hit && hit.token === token) {
      void idbTouch(k, 0);
      return { data: hit.data, fromCache: true, token, at: hit.at };
    }
  }
  const data = await opt.load();
  const at = Date.now();
  let size = 0;
  try { size = JSON.stringify(data)?.length ?? 0; } catch { size = MAX_ENTRY + 1; }
  if (size <= MAX_ENTRY) {
    await idbPut(k, { token, data, at }, size);
    void evict();
  }
  return { data, fromCache: false, token, at };
}

// Hook: tampilkan data cache segera (stale-while-revalidate), perbarui bila token berubah,
// dan muat ulang otomatis saat dataset terkait berubah di server (realtime data_versions).
export function useCachedQuery<T>(
  key: string | null,
  deps: readonly DatasetKey[],
  load: () => Promise<T>,
  opts: { live?: boolean } = {},
) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<{ key: string | null; data: T | null; fromCache: boolean; at: number | null; error: Error | null; loading: boolean }>(
    { key: null, data: null, fromCache: false, at: null, error: null, loading: true });
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });
  const depsKey = deps.join(",");
  const [nonce, setNonce] = useState(0);
  const forceRef = useRef(false);

  // Data lama dari key lain tidak ditampilkan untuk key baru.
  if (state.key !== key) setState({ key, data: null, fromCache: false, at: null, error: null, loading: !!key });

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const force = forceRef.current;
    forceRef.current = false;
    (async () => {
      // 1. Tampilkan cache apa pun tokennya (cepat), 2. validasi token, muat ulang bila perlu.
      if (!force) {
        const { data: s } = await supabase.auth.getSession();
        const stale = await idbGet<T>(`${s.session?.user.id ?? "anon"}:${key}`);
        if (stale && !cancelled) setState((p) => (p.data ? p : { ...p, data: stale.data, fromCache: true, at: stale.at }));
      }
      const res = await cachedQuery(supabase, { key, deps: depsKey.split(",") as DatasetKey[], load: () => loadRef.current(), force });
      if (!cancelled) setState({ key, data: res.data, fromCache: res.fromCache, at: res.at, error: null, loading: false });
    })().catch((e: Error) => { if (!cancelled) setState((p) => ({ ...p, error: e, loading: false })); });
    return () => { cancelled = true; };
  }, [key, depsKey, nonce, supabase]);

  useEffect(() => {
    if (opts.live === false || !key) return;
    const deps = new Set(depsKey.split(","));
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = onVersionChange((k) => {
      if (!deps.has(k)) return;
      clearTimeout(t);
      t = setTimeout(() => setNonce((n) => n + 1), 1500);
    });
    return () => { off(); clearTimeout(t); };
  }, [key, depsKey, opts.live]);

  const reload = useCallback((force = true) => { forceRef.current = force; setNonce((n) => n + 1); }, []);
  return { data: state.data, fromCache: state.fromCache, at: state.at, error: state.error, loading: state.loading, reload };
}

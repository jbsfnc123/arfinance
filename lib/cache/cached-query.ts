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
const pending = new Map<string, Promise<CachedResult<unknown>>>();

export async function cachedQuery<T>(
  supabase: SupabaseClient<Database>,
  opt: { key: string; deps: readonly DatasetKey[]; load: () => Promise<T>; force?: boolean; depsFor?: (data: T) => readonly DatasetKey[] },
): Promise<CachedResult<T>> {
  const k = `${await userId(supabase)}:${opt.key}`;
  const hit = !opt.force ? await idbGet<T>(k) : null;
  const checkedDeps = hit && opt.depsFor ? opt.depsFor(hit.data) : opt.deps;
  const token = await getToken(supabase, checkedDeps, !!opt.force);
  if (!opt.force) {
    if (hit && hit.token === token) {
      void idbTouch(k, 0);
      return { data: hit.data, fromCache: true, token, at: hit.at };
    }
  }
  const pendingKey = `${k}:${token}`;
  const existing = pending.get(pendingKey);
  if (existing) return existing as Promise<CachedResult<T>>;
  const request = (async (): Promise<CachedResult<T>> => {
    const data = await opt.load();
    const afterDeps = opt.depsFor?.(data) ?? opt.deps;
    const sameDeps = afterDeps.length === checkedDeps.length && afterDeps.every((d,i) => d === checkedDeps[i]);
    const savedToken = sameDeps ? token : await getToken(supabase, afterDeps, true);
    const at = Date.now();
    let size = 0;
    try { size = JSON.stringify(data)?.length ?? 0; } catch { size = MAX_ENTRY + 1; }
    if (size <= MAX_ENTRY) {
      await idbPut(k, { token: savedToken, data, at }, size);
      void evict();
    }
    return { data, fromCache: false, token: savedToken, at };
  })().finally(() => { pending.delete(pendingKey); });
  pending.set(pendingKey, request);
  return request;
}

// Hook: tampilkan data cache segera (stale-while-revalidate), perbarui bila token berubah,
// dan muat ulang otomatis saat dataset terkait berubah di server (realtime data_versions).
export function useCachedQuery<T>(
  key: string | null,
  deps: readonly DatasetKey[],
  load: () => Promise<T>,
  // liveDelayMs: jeda muat ulang otomatis setelah dataset berubah (default 1,5 dtk); perubahan beruntun digabung.
  opts: { live?: boolean; depsFor?: (data: T) => readonly DatasetKey[]; liveDelayMs?: number } = {},
) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<{ key: string | null; data: T | null; fromCache: boolean; at: number | null; error: Error | null; loading: boolean }>(
    { key: null, data: null, fromCache: false, at: null, error: null, loading: true });
  const loadRef = useRef(load);
  const depsForRef = useRef(opts.depsFor);
  useEffect(() => { loadRef.current = load; });
  useEffect(() => { depsForRef.current = opts.depsFor; });
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
      const res = await cachedQuery(supabase, { key, deps: depsKey.split(",") as DatasetKey[], depsFor: (data) => depsForRef.current?.(data) ?? depsKey.split(",") as DatasetKey[], load: () => loadRef.current(), force });
      if (!cancelled) setState({ key, data: res.data, fromCache: res.fromCache, at: res.at, error: null, loading: false });
    })().catch((e: Error) => { if (!cancelled) setState((p) => ({ ...p, error: e, loading: false })); });
    return () => { cancelled = true; };
  }, [key, depsKey, nonce, supabase]);

  useEffect(() => {
    if (opts.live === false || !key) return;
    const deps = new Set(state.data && opts.depsFor ? opts.depsFor(state.data) : depsKey.split(","));
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = onVersionChange((k) => {
      if (!deps.has(k)) return;
      clearTimeout(t);
      t = setTimeout(() => setNonce((n) => n + 1), opts.liveDelayMs ?? 1500);
    });
    return () => { off(); clearTimeout(t); };
  }, [key, depsKey, opts.live, opts.depsFor, opts.liveDelayMs, state.data]);

  const reload = useCallback((force = true) => { forceRef.current = force; setNonce((n) => n + 1); }, []);
  return { data: state.data, fromCache: state.fromCache, at: state.at, error: state.error, loading: state.loading, reload };
}

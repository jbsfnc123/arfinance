"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

// State tampilan yang diingat selama tab browser terbuka (sessionStorage): filter, pencarian, urutan, tab, bulan,
// centang, posisi scroll. Pindah menu / refresh tidak mengubah data yang sedang dibuka; tab baru & logout mulai
// bersih. Dibaca lewat useSyncExternalStore (snapshot server = nilai awal) → aman untuk render server/hidrasi.

const PREFIX = "view:";
const OWNER = "view-owner";

type Entry = { raw: string | null; val: unknown };
const mem = new Map<string, Entry>();      // cache nilai terurai (referensi stabil) + cadangan bila storage ditolak
const fallback = new Map<string, string>(); // dipakai bila sessionStorage tidak tersedia
const listeners = new Map<string, Set<() => void>>();

function storage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
}
function readRaw(k: string): string | null {
  const s = storage();
  if (!s) return fallback.get(k) ?? null;
  try { return s.getItem(k); } catch { return fallback.get(k) ?? null; }
}
function writeRaw(k: string, v: string | null) {
  const s = storage();
  try {
    if (!s) throw new Error("no storage");
    if (v === null) s.removeItem(k); else s.setItem(k, v);
  } catch {
    if (v === null) fallback.delete(k); else fallback.set(k, v);
  }
}
function notify(k?: string) {
  if (k) listeners.get(k)?.forEach((fn) => fn());
  else listeners.forEach((set) => set.forEach((fn) => fn()));
}

type Opts = { set?: boolean };
const decode = (raw: string, o: Opts) => { const v = JSON.parse(raw); return o.set ? new Set(v as unknown[]) : v; };
const encode = (v: unknown, o: Opts) => JSON.stringify(o.set ? [...(v as Set<unknown>)] : v);

/** Nilai tersimpan untuk `key`, atau `undefined` bila belum ada / rusak. */
export function readViewState<T>(key: string, o: Opts = {}): T | undefined {
  const k = PREFIX + key;
  const raw = readRaw(k);
  const hit = mem.get(k);
  if (hit && hit.raw === raw) return hit.val as T | undefined;
  let val: unknown;
  try { val = raw === null ? undefined : decode(raw, o); } catch { val = undefined; }
  mem.set(k, { raw, val });
  return val as T | undefined;
}

export function writeViewState<T>(key: string, value: T | undefined, o: Opts = {}) {
  const k = PREFIX + key;
  const raw = value === undefined ? null : encode(value, o);
  writeRaw(k, raw);
  mem.set(k, { raw, val: value });
  notify(k);
}

function allKeys(): string[] {
  const s = storage();
  const keys = new Set<string>(fallback.keys());
  if (s) { try { for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k) keys.add(k); } } catch { /* abaikan */ } }
  return [...keys].filter((k) => k.startsWith(PREFIX));
}

/** Hapus semua state tampilan (logout). */
export function clearViewState() {
  for (const k of allKeys()) writeRaw(k, null);
  writeRaw(OWNER, null);
  mem.clear();
  notify();
}

/** Pastikan state milik akun ini; bila akun lain login di tab yang sama, state lama dibuang. Idempoten. */
export function ensureViewOwner(userId: string) {
  if (typeof window === "undefined" || !userId) return;
  const cur = readRaw(OWNER);
  if (cur === userId) return;
  if (cur !== null) clearViewState();
  writeRaw(OWNER, userId);
}

/** Pengganti useState untuk state tampilan yang harus bertahan saat pindah menu. */
export function useViewState<T>(key: string, initial: T, o: Opts = {}): [T, (v: T | ((prev: T) => T)) => void] {
  const [init] = useState(initial); // referensi stabil untuk nilai awal
  const set = !!o.set;
  const subscribe = useCallback((fn: () => void) => {
    const k = PREFIX + key;
    const s = listeners.get(k) ?? new Set();
    s.add(fn); listeners.set(k, s);
    return () => { s.delete(fn); };
  }, [key]);
  const value = useSyncExternalStore(subscribe, () => readViewState<T>(key, { set }) ?? init, () => init);
  const setValue = useCallback((v: T | ((prev: T) => T)) => {
    const prev = readViewState<T>(key, { set }) ?? init;
    const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
    writeViewState(key, next, { set });
  }, [key, init, set]);
  return [value, setValue];
}

/**
 * Ingat posisi scroll kotak tabel. Dipulihkan sekali setelah isi cukup tinggi (data virtual sudah tampil);
 * `ready` = data sudah dimuat.
 */
export function useScrollMemory(ref: RefObject<HTMLElement | null>, key: string, ready: boolean) {
  const restored = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const save = () => {
      if (t) return;
      t = setTimeout(() => { t = null; writeRaw(PREFIX + key, JSON.stringify({ top: el.scrollTop, left: el.scrollLeft })); }, 150);
    };
    el.addEventListener("scroll", save, { passive: true });
    return () => { el.removeEventListener("scroll", save); if (t) clearTimeout(t); };
  }, [ref, key]);
  useEffect(() => {
    const el = ref.current;
    if (!el || !ready || restored.current) return;
    restored.current = true;
    let pos: { top: number; left: number } | null = null;
    try { pos = JSON.parse(readRaw(PREFIX + key) ?? "null"); } catch { pos = null; }
    if (!pos || (!pos.top && !pos.left)) return;
    // Tinggi total virtual scroll bisa baru terukur setelah beberapa frame → coba beberapa kali.
    let tries = 0;
    const apply = () => {
      el.scrollTop = pos!.top; el.scrollLeft = pos!.left;
      if (Math.abs(el.scrollTop - pos!.top) > 2 && ++tries < 20) requestAnimationFrame(apply);
    };
    requestAnimationFrame(apply);
  }, [ref, key, ready]);
}

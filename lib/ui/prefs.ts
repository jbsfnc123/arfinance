"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

// Preferensi tampilan per browser (localStorage): tema Dark/Light/System, kepadatan & transparansi. Diterapkan sebagai
// atribut `data-theme` / `data-density` / `data-transparency` di <html>. Skrip inline (PREFS_SCRIPT) menerapkannya sebelum paint pertama agar tidak
// berkedip; hook di sini untuk mengubah & membaca dari komponen (aman untuk render server: snapshot server = default).

export type ThemeMode = "dark" | "light" | "system";
export type Density = "comfortable" | "compact";
export type Transparency = "normal" | "reduced";
export { THEME_KEY, DENSITY_KEY, TRANSPARENCY_KEY, DEFAULT_THEME } from "./prefs-script";
import { THEME_KEY, DENSITY_KEY, TRANSPARENCY_KEY, DEFAULT_THEME } from "./prefs-script";

export const isThemeMode = (v: unknown): v is ThemeMode => v === "dark" || v === "light" || v === "system";
export const isDensity = (v: unknown): v is Density => v === "comfortable" || v === "compact";

/** Tema efektif dari mode + preferensi OS. */
export function resolveTheme(mode: ThemeMode, prefersDark: boolean): "dark" | "light" {
  return mode === "system" ? (prefersDark ? "dark" : "light") : mode;
}

const DARK_Q = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const notify = () => listeners.forEach((fn) => fn());
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* opsional */ } notify(); };

// Satu jalur untuk perubahan dari luar (tema OS berubah, preferensi diubah di tab lain): terapkan ke <html> dulu, lalu
// beri tahu komponen. Listener OS/storage dipasang sekali selama ada subscriber dan dilepas saat subscriber terakhir pergi.
let detachExternal: (() => void) | null = null;
const onExternal = () => { applyPrefs(); notify(); };
const onStorage = (e: StorageEvent) => { if (e.key === null || e.key.startsWith("prefs:")) onExternal(); };
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  if (!detachExternal && typeof window !== "undefined") {
    const mq = typeof matchMedia === "function" ? matchMedia(DARK_Q) : null;
    mq?.addEventListener("change", onExternal);
    window.addEventListener("storage", onStorage);
    detachExternal = () => { mq?.removeEventListener("change", onExternal); window.removeEventListener("storage", onStorage); };
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size && detachExternal) { detachExternal(); detachExternal = null; }
  };
};

export function applyPrefs() {
  if (typeof document === "undefined") return;
  const raw = read(THEME_KEY);
  const mode = isThemeMode(raw) ? raw : DEFAULT_THEME;
  const d = document.documentElement;
  d.setAttribute("data-theme", resolveTheme(mode, matchMedia(DARK_Q).matches));
  d.setAttribute("data-theme-mode", mode);
  if (read(DENSITY_KEY) === "compact") d.setAttribute("data-density", "compact"); else d.removeAttribute("data-density");
  if (read(TRANSPARENCY_KEY) === "reduced") d.setAttribute("data-transparency", "reduced"); else d.removeAttribute("data-transparency");
}

export function useTheme(): [ThemeMode, (m: ThemeMode) => void] {
  const raw = useSyncExternalStore(subscribe, () => read(THEME_KEY), () => null);
  const mode = isThemeMode(raw) ? raw : DEFAULT_THEME;
  const set = useCallback((m: ThemeMode) => { write(THEME_KEY, m); applyPrefs(); }, []);
  return [mode, set];
}

export function useDensity(): [Density, (d: Density) => void] {
  const raw = useSyncExternalStore(subscribe, () => read(DENSITY_KEY), () => null);
  const density = isDensity(raw) ? raw : "comfortable";
  const set = useCallback((d: Density) => { write(DENSITY_KEY, d); applyPrefs(); }, []);
  return [density, set];
}

/** "Kurangi transparansi": kaca (Top bar, Dock, popover, modal) menjadi permukaan solid. */
export function useTransparency(): [Transparency, (t: Transparency) => void] {
  const raw = useSyncExternalStore(subscribe, () => read(TRANSPARENCY_KEY), () => null);
  const value: Transparency = raw === "reduced" ? "reduced" : "normal";
  const set = useCallback((t: Transparency) => { write(TRANSPARENCY_KEY, t); applyPrefs(); }, []);
  return [value, set];
}

/** Tema efektif saat ini (untuk chart yang butuh warna konkret). */
export function useResolvedTheme(): "dark" | "light" {
  const [mode] = useTheme();
  const prefersDark = useSyncExternalStore(subscribe, () => matchMedia(DARK_Q).matches, () => true);
  return resolveTheme(mode, prefersDark);
}

/** Pasang sinkronisasi preferensi (tema OS & tab lain) tanpa membaca nilai apa pun — dipakai <PrefsSync /> di root layout. */
export function usePrefsSync() {
  useEffect(() => subscribe(() => {}), []);
}

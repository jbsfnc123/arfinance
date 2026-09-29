"use client";

import { useCallback, useSyncExternalStore } from "react";

// Preferensi tampilan per browser (localStorage): tema Dark/Light/System & kepadatan. Diterapkan sebagai atribut
// `data-theme` / `data-density` di <html>. Skrip inline (PREFS_SCRIPT) menerapkannya sebelum paint pertama agar tidak
// berkedip; hook di sini untuk mengubah & membaca dari komponen (aman untuk render server: snapshot server = default).

export type ThemeMode = "dark" | "light" | "system";
export type Density = "comfortable" | "compact";
export { THEME_KEY, DENSITY_KEY, DEFAULT_THEME } from "./prefs-script";
import { THEME_KEY, DENSITY_KEY, DEFAULT_THEME } from "./prefs-script";

export const isThemeMode = (v: unknown): v is ThemeMode => v === "dark" || v === "light" || v === "system";
export const isDensity = (v: unknown): v is Density => v === "comfortable" || v === "compact";

/** Tema efektif dari mode + preferensi OS. */
export function resolveTheme(mode: ThemeMode, prefersDark: boolean): "dark" | "light" {
  return mode === "system" ? (prefersDark ? "dark" : "light") : mode;
}

const listeners = new Set<() => void>();
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* opsional */ } listeners.forEach((fn) => fn()); };
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  const mq = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  mq?.addEventListener("change", fn);
  return () => { listeners.delete(fn); mq?.removeEventListener("change", fn); };
};

export function applyPrefs() {
  if (typeof document === "undefined") return;
  const raw = read(THEME_KEY);
  const mode = isThemeMode(raw) ? raw : DEFAULT_THEME;
  const d = document.documentElement;
  d.setAttribute("data-theme", resolveTheme(mode, matchMedia("(prefers-color-scheme: dark)").matches));
  d.setAttribute("data-theme-mode", mode);
  if (read(DENSITY_KEY) === "compact") d.setAttribute("data-density", "compact"); else d.removeAttribute("data-density");
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

/** Tema efektif saat ini (untuk chart yang butuh warna konkret). */
export function useResolvedTheme(): "dark" | "light" {
  const [mode] = useTheme();
  const prefersDark = useSyncExternalStore(subscribe, () => matchMedia("(prefers-color-scheme: dark)").matches, () => true);
  return resolveTheme(mode, prefersDark);
}

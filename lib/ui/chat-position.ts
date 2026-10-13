"use client";

import { useSyncExternalStore } from "react";

// Posisi tombol chat AR Helpdesk yang bisa digeser (Fase 67). Disimpan per perangkat di localStorage: tombol menempel ke
// tepi kiri/kanan, `b` = jarak tepi bawah tombol ke bawah layar (px). null = posisi bawaan (kanan bawah).

export type ChatPos = { side: "left" | "right"; b: number };

export const CHAT_BTN = 44;
const KEY = "prefs:chatPos";
const MARGIN = 8;
const TOP_RESERVE = 56; // top bar + jarak

/** Batas `b` agar tombol tidak keluar layar atau menutupi top bar. */
export const clampB = (b: number, vh: number) => Math.round(Math.max(MARGIN, Math.min(b, vh - TOP_RESERVE - CHAT_BTN)));

/** Titik lepas (pojok kiri-atas tombol) → tepi terdekat & jarak dari bawah. */
export function snapChatPos(x: number, y: number, vw: number, vh: number): ChatPos {
  return { side: x + CHAT_BTN / 2 < vw / 2 ? "left" : "right", b: clampB(vh - y - CHAT_BTN, vh) };
}

/** Kotak panel chat: di atas tombol bila tombol di separuh bawah layar, di bawahnya bila di separuh atas. */
export function chatPanelBox(pos: ChatPos, vh: number): { top?: number; bottom?: number; height: number } {
  const b = clampB(pos.b, vh);
  if (b + CHAT_BTN / 2 <= vh / 2) return { bottom: b + CHAT_BTN + MARGIN, height: Math.min(640, vh - b - CHAT_BTN - MARGIN * 2) };
  const top = vh - b + MARGIN;
  return { top, height: Math.min(640, vh - top - MARGIN) };
}

export function parseChatPos(raw: string | null): ChatPos | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ChatPos>;
    return (v.side === "left" || v.side === "right") && typeof v.b === "number" && Number.isFinite(v.b) && v.b >= 0 ? { side: v.side, b: v.b } : null;
  } catch { return null; }
}

// Store kecil di atas localStorage (try/catch: mode privat/penyimpanan diblokir → posisi bawaan).
const listeners = new Set<() => void>();
let cacheRaw: string | null | undefined, cacheVal: ChatPos | null = null;
function read(): ChatPos | null {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { /* diblokir */ }
  if (raw !== cacheRaw) { cacheRaw = raw; cacheVal = parseChatPos(raw); }
  return cacheVal;
}
export function saveChatPos(pos: ChatPos | null) {
  try { if (pos) localStorage.setItem(KEY, JSON.stringify(pos)); else localStorage.removeItem(KEY); } catch { /* diblokir */ }
  listeners.forEach((fn) => fn());
}
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) fn(); };
  addEventListener("storage", onStorage);
  return () => { listeners.delete(fn); removeEventListener("storage", onStorage); };
};
export const useChatPos = () => useSyncExternalStore(subscribe, read, () => null);

const onResize = (fn: () => void) => { addEventListener("resize", fn); return () => removeEventListener("resize", fn); };
export const useViewportH = () => useSyncExternalStore(onResize, () => innerHeight, () => 800);

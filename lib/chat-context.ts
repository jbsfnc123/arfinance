"use client";

import { useEffect, useRef } from "react";
import { MENU_REGISTRY } from "@/lib/menu";

// Ringkasan halaman untuk chat QnA AR Workspace (Fase 52). Halaman/tabel mendaftarkan apa yang SUDAH tampil di layar
// (data lokal yang memang boleh dilihat akun ini); chat memintanya lewat postMessage hanya saat user bertanya/menekan 📎.
// Tidak ada query baru, token, atau data di luar layar yang dikirim.

export type ChatSource = {
  title: string;                                   // mis. "Kertas Kerja Mitra10", "Ringkasan Dashboard"
  filters?: Record<string, string>;
  summary?: Record<string, string | number | null>;
  columns?: string[];
  rows?: (string | number | null)[][];
  total?: number;                                  // jumlah baris sebenarnya (rows hanya sampel)
};
type Entry = ChatSource & { at: number };

const sources = new Map<string, Entry>();
let seq = 0; // urutan terbaru (Date.now() bisa sama dalam 1 ms)
export const MAX_ROWS = 50;
export const MAX_CHARS = 11000;

export function publishChatContext(id: string, src: ChatSource | null) {
  if (!src) sources.delete(id);
  else sources.set(id, { ...src, at: ++seq });
}

/** Daftarkan ringkasan selama komponen tampil; `build` dipanggil malas (saat chat meminta) agar render tetap ringan. */
export function useChatContext(id: string, build: () => ChatSource | null, deps: readonly unknown[]) {
  const ref = useRef(build);
  useEffect(() => { ref.current = build; });
  useEffect(() => {
    lazy.set(id, () => ref.current());
    sources.set(id, { title: "", at: ++seq }); // tandai urutan terbaru
    return () => { lazy.delete(id); sources.delete(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps menandai "konteks berubah" (urutan terbaru)
  }, [id, ...deps]);
}
const lazy = new Map<string, () => ChatSource | null>();

const cell = (v: unknown) => (v == null ? null : typeof v === "number" ? v : String(v).slice(0, 80));

export function menuLabel(path: string) {
  let best: { label: string; group: string; len: number } | null = null;
  for (const g of MENU_REGISTRY) for (const m of g.children) {
    if ((path === m.href || path.startsWith(m.href + "/")) && (!best || m.href.length > best.len)) best = { label: m.label, group: g.label, len: m.href.length };
  }
  return best ? `${best.group} › ${best.label}` : path === "/" ? "Beranda" : path;
}

/** Ringkasan aktif: maks 3 sumber terbaru, total ≤ 50 baris, JSON ≤ MAX_CHARS (baris dipangkas bila perlu). */
export function chatContextSnapshot(path: string, today: string) {
  const list = [...sources.entries()].sort((a, b) => b[1].at - a[1].at).slice(0, 3).map(([id, e]) => {
    const built = lazy.get(id)?.() ?? (e.title ? e : null);
    return built ? { ...built } : null;
  }).filter((x): x is ChatSource => !!x);
  let budget = MAX_ROWS;
  const items = list.map((s) => {
    const rows = (s.rows ?? []).slice(0, Math.max(0, budget)).map((r) => r.map(cell));
    budget -= rows.length;
    return { title: s.title, filters: s.filters, summary: s.summary, columns: s.columns?.slice(0, 15), rows, total: s.total ?? s.rows?.length };
  });
  const out = { menu: menuLabel(path), path, today, sources: items };
  while (JSON.stringify(out).length > MAX_CHARS && out.sources.some((s) => s.rows.length)) {
    const s = [...out.sources].sort((a, b) => b.rows.length - a.rows.length)[0];
    s.rows = s.rows.slice(0, Math.floor(s.rows.length * 0.7));
  }
  return out;
}

/** Origin frame Apps Script (HtmlService menyajikan isi di *.googleusercontent.com). */
export const isChatOrigin = (origin: string) => /^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(origin) || origin === "https://script.google.com";

/** Apakah `w` adalah frame chat atau frame di dalamnya (HtmlService membungkus isi dengan iframe bertingkat). */
export function isWithin(frame: Window | null | undefined, w: unknown, depth = 3): boolean {
  if (!frame || !w) return false;
  if (frame === w) return true;
  if (depth === 0) return false;
  try {
    for (let i = 0; i < frame.frames.length; i++) if (isWithin(frame.frames[i], w, depth - 1)) return true;
  } catch { /* lintas origin: length & index boleh diakses; lainnya diabaikan */ }
  return false;
}

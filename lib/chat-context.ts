import { MENU_REGISTRY } from "@/lib/menu";

// Chat QnA AR Workspace hanya perlu tahu HALAMAN yang sedang dibuka user (nama menu), bukan isi datanya.
// Frame Apps Script memintanya lewat postMessage saat user mengirim pesan; ConsultantChat membalas {menu, path}.

export function menuLabel(path: string) {
  let best: { label: string; group: string; len: number } | null = null;
  for (const g of MENU_REGISTRY) for (const m of g.children) {
    if ((path === m.href || path.startsWith(m.href + "/")) && (!best || m.href.length > best.len)) best = { label: m.label, group: g.label, len: m.href.length };
  }
  return best ? `${best.group} › ${best.label}` : path === "/" ? "Beranda" : path;
}

/** Origin frame Apps Script (HtmlService menyajikan isi di *-script.googleusercontent.com). */
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

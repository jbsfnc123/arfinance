import type { CSSProperties } from "react";

// Kelas Tailwind bersama (token tema di app/globals.css; gelap & terang).
export const inputCls =
  "w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none transition-colors focus:border-accent";
export const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent shadow-sm transition-colors hover:bg-accent-strong disabled:opacity-60";
export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-full border border-line bg-surface/60 px-3 py-1.5 text-sm transition-colors hover:bg-surface-2 disabled:opacity-60";
/** Tombol ikon toolbar ala macOS: kecil, tanpa isi, hover tembus pandang. */
export const toolbarBtn =
  "inline-flex h-7 min-w-7 items-center justify-center gap-1.5 rounded-lg px-1.5 text-fg-2 transition-colors hover:bg-fg/8 hover:text-fg active:bg-fg/12 disabled:opacity-50";
/** Kartu data (opak — tanpa blur agar angka & chart tajam). */
export const card = "rounded-2xl border border-hairline bg-surface shadow-sm";
export const cardTitle = "text-[13px] font-semibold";
export const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums";
export const th = "whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-fg-2";
export const td = "whitespace-nowrap px-3 py-2";
/** Tabel data ringkas: header sticky semi-transparan, pemisah tipis, hover lembut, angka rata. */
export const tableCls =
  "w-full text-[13px] tabular-nums [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-[1] [&_thead]:bg-surface/90 [&_thead]:backdrop-blur [&_thead_th]:border-b [&_thead_th]:border-hairline [&_tbody_tr]:border-t [&_tbody_tr]:border-hairline [&_tbody_tr:first-child]:border-t-0 [&_tbody_tr:hover]:bg-fg/[0.04]";

/** Plate ikon ber-tint per grup menu (identitas modul di Dock, Launcher, Spotlight). Id grup dari lib/menu.ts. */
const TINT: Record<string, string> = {
  home: "#7c93b8", dashboard: "#4f8df0", collection: "#3fae74", tukar: "#e39a3b", invoicing: "#9a73e0",
  billing: "#2fb4c8", rekon: "#d8b43a", tools: "#6f86a6", set: "#8b909a", launcher: "#8b909a",
};
export const tintOf = (groupId: string) => TINT[groupId] ?? TINT.set;
/** Latar tint lembut + warna ikon tint; color-mix menjaga keterbacaan di tema gelap & terang. */
export const plateStyle = (groupId: string): CSSProperties => {
  const c = tintOf(groupId);
  return {
    background: `linear-gradient(180deg, color-mix(in srgb, ${c} 30%, var(--surface-elevated)), color-mix(in srgb, ${c} 17%, var(--surface-elevated)))`,
    color: `color-mix(in srgb, ${c} 82%, var(--text-primary))`,
    boxShadow: "inset 0 1px 0 var(--highlight), 0 1px 2px rgba(0,0,0,.12)",
  };
};

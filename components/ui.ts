// Kelas Tailwind bersama (token tema di app/globals.css; gelap & terang).
// Tinggi kontrol seragam lewat --control-h (28px Padat / 30px Nyaman). Input 16px di layar sempit agar iOS tidak zoom.
export const inputCls =
  "w-full min-h-[var(--control-h)] rounded-[8px] border border-line bg-surface-2 px-2.5 py-1 text-[13px] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-fg-2/80 focus:border-accent-tint focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-tint)_22%,transparent)] disabled:opacity-60 max-sm:text-base";
export const btnPrimary =
  "inline-flex h-[var(--control-h)] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-accent-fill px-3.5 text-[13px] font-medium text-on-accent shadow-sm transition-colors duration-150 [&>svg]:size-4 hover:bg-accent-fill-hover active:brightness-95 disabled:pointer-events-none disabled:opacity-50";
export const btnGhost =
  "inline-flex h-[var(--control-h)] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-hairline bg-surface px-3 text-[13px] shadow-sm transition-colors duration-150 [&>svg]:size-4 hover:bg-surface-2 active:bg-fill-3 disabled:pointer-events-none disabled:opacity-50";
/** Tombol ikon toolbar ala macOS: kecil, tanpa isi, hover tembus pandang. */
export const toolbarBtn =
  "inline-flex h-7 min-w-7 items-center justify-center gap-1.5 rounded-[8px] px-1.5 text-fg-2 transition-colors duration-150 hover:bg-fg/8 hover:text-fg active:bg-fg/12 disabled:opacity-50";
/** Kartu data (opak — tanpa blur agar angka & chart tajam). */
export const card = "rounded-2xl border border-hairline bg-surface shadow-sm";
export const cardTitle = "text-[13px] font-semibold";
export const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums";
export const th = "whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-fg-2";
export const td = "whitespace-nowrap px-3 py-2";
/** Tabel data ringkas: header sticky semi-transparan, pemisah tipis, hover lembut, angka rata. */
export const tableCls =
  "w-full text-[13px] tabular-nums [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-[1] [&_thead]:bg-surface/90 [&_thead]:backdrop-blur [&_thead_th]:border-b [&_thead_th]:border-hairline [&_tbody_tr]:border-t [&_tbody_tr]:border-hairline [&_tbody_tr:first-child]:border-t-0 [&_tbody_tr:hover]:bg-fg/[0.04]";

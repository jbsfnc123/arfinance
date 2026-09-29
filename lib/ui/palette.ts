// Satu sumber warna semantik untuk chart & indikator. Dua varian: gelap (sedikit desaturasi, tanpa neon) dan terang
// (sedikit lebih pekat agar tidak pucat di latar putih). Arti warna sama di kedua tema.
// Warna teks/grid chart mengikuti tema aktif lewat chartTheme() (dibaca dari token CSS saat render).

type Theme = "dark" | "light";
const isLight = (): boolean => typeof document !== "undefined" && document.documentElement.dataset.theme === "light";
const pick = <T,>(dark: T, light: T, theme?: Theme): T => ((theme ?? (isLight() ? "light" : "dark")) === "light" ? light : dark);

/** Aging: Belum Jatuh Tempo · 1-30 · 31-60 · >60 (hijau → kuning → oranye → merah). */
const AGING_DARK: readonly string[] = ["#2fa876", "#e1b54a", "#e48a4c", "#d9625c"];
const AGING_LIGHT: readonly string[] = ["#1f8f5f", "#c99a1c", "#d9722f", "#c9443d"];
export const agingColors = (theme?: Theme) => pick(AGING_DARK, AGING_LIGHT, theme);
/** Kompatibilitas: nilai gelap (dipakai halaman yang belum memakai agingColors()). */
export const AGING_COLOR = AGING_DARK;

const SERIES_DARK = { collected: "#2c9a6c", promise: "#79c6b8", bar: "#6690d6", success: "#7fc796", warning: "#e5c261", danger: "#e2877f", accent: "#8ab4f8" };
const SERIES_LIGHT = { collected: "#1d8a5c", promise: "#3fa89a", bar: "#3f72d0", success: "#1f8a55", warning: "#c08b12", danger: "#cf4a42", accent: "#2563eb" };
export const seriesColors = (theme?: Theme) => pick(SERIES_DARK, SERIES_LIGHT, theme);
/** Kompatibilitas: nilai gelap. */
export const SERIES = SERIES_DARK;

/** Warna pencapaian: ≥80 hijau, ≥50 kuning, sisanya merah. */
export const pctColor = (pct: number, theme?: Theme) => {
  const c = agingColors(theme);
  return pct >= 80 ? c[0] : pct >= 50 ? c[1] : c[3];
};

/** Warna teks/grid/sisa-donat chart dari token tema aktif (fallback gelap untuk render server). */
export function chartTheme() {
  if (typeof document === "undefined") return { text: "#9ea3ad", grid: "rgba(255,255,255,.07)", track: "#393b41", label: "#e8e9ec" };
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) => s.getPropertyValue(name).trim() || fb;
  return { text: v("--text-2", "#9ea3ad"), grid: v("--chart-grid", "rgba(255,255,255,.07)"), track: v("--chart-track", "#393b41"), label: v("--text", "#e8e9ec") };
}

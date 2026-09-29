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

const SERIES_DARK = { collected: "#2c9a6c", promise: "#79c6b8", bar: "#5a8ee0", success: "#5fc98a", warning: "#e5c261", danger: "#ec8a80", accent: "#409cff" };
const SERIES_LIGHT = { collected: "#1d8a5c", promise: "#3fa89a", bar: "#2f6fd6", success: "#23945a", warning: "#b38310", danger: "#c94a40", accent: "#0066d6" };
export const seriesColors = (theme?: Theme) => pick(SERIES_DARK, SERIES_LIGHT, theme);
/** Kompatibilitas: nilai gelap. */
export const SERIES = SERIES_DARK;

/** Kategori tanpa urutan makna (marketplace, toko, dsb.). Indeks 0 = oranye marketplace (Shopee). */
const CAT_DARK: readonly string[] = ["#f0643f", "#6aa7f8", "#5fc98a", "#e5c261", "#b48cf2", "#5fcfe0", "#ec8a80", "#9fd3b2", "#a1a1a6", "#f5a764"];
const CAT_LIGHT: readonly string[] = ["#e0492a", "#2f6fd6", "#23945a", "#b38310", "#7e4fd0", "#16889a", "#c94a40", "#4f9a70", "#6e6e73", "#d17420"];
export const categoryColors = (theme?: Theme) => pick(CAT_DARK, CAT_LIGHT, theme);

/** Warna pencapaian: ≥80 hijau, ≥50 kuning, sisanya merah. */
export const pctColor = (pct: number, theme?: Theme) => {
  const c = agingColors(theme);
  return pct >= 80 ? c[0] : pct >= 50 ? c[1] : c[3];
};

/** Warna teks/grid/sisa-donat chart dari token tema aktif (fallback gelap untuk render server). */
export function chartTheme() {
  if (typeof document === "undefined") return { text: "#aeaeb2", grid: "rgba(255,255,255,.07)", track: "#3a3a3c", label: "#f5f5f7", surface: "#242426" };
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) => s.getPropertyValue(name).trim() || fb;
  return { text: v("--text-2", "#aeaeb2"), grid: v("--chart-grid", "rgba(255,255,255,.07)"), track: v("--chart-track", "#3a3a3c"), label: v("--text", "#f5f5f7"), surface: v("--surface", "#242426") };
}

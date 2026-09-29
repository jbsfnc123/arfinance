// Satu sumber warna semantik untuk chart & indikator (nilai sama dengan yang dulu tersebar di beberapa halaman).
// Warna teks/grid chart mengikuti tema aktif lewat chartTheme() (dibaca dari token CSS saat render).

/** Aging: Belum Jatuh Tempo · 1-30 · 31-60 · >60 (hijau → kuning → oranye → merah). */
export const AGING_COLOR = ["#23ad7a", "#eebb3c", "#f08a3f", "#e25b5b"] as const;

export const SERIES = {
  collected: "#1f9d6b",
  promise: "#7fd0c2",
  bar: "#5f8fd8",
  success: "#81c995",
  warning: "#fdd663",
  danger: "#f28b82",
  accent: "#8ab4f8",
} as const;

/** Warna pencapaian: ≥80 hijau, ≥50 kuning, sisanya merah (sama dengan pctColor lama). */
export const pctColor = (pct: number) => (pct >= 80 ? "#23ad7a" : pct >= 50 ? "#eebb3c" : "#e25b5b");

/** Warna teks/grid/sisa-donat chart dari token tema aktif (fallback gelap untuk render server). */
export function chartTheme() {
  if (typeof document === "undefined") return { text: "#9aa0a6", grid: "rgba(255,255,255,.08)", track: "#3c4043", label: "#e8eaed" };
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) => s.getPropertyValue(name).trim() || fb;
  return { text: v("--text-2", "#9aa0a6"), grid: v("--chart-grid", "rgba(255,255,255,.08)"), track: v("--chart-track", "#3c4043"), label: v("--text", "#e8eaed") };
}

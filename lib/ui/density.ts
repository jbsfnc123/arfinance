import type { Density } from "./prefs";

// Tinggi baris tabel virtual per kepadatan (Control Center → Kepadatan tabel). Estimasi virtualizer memakai nilai ini
// sehingga posisi scroll & baris yang dirender tetap tepat saat Padat; baris "Teks penuh" tetap diukur apa adanya.
export function rowHeight(density: Density, base: number): number {
  return density === "compact" ? base - (base >= 40 ? 8 : 6) : base;
}

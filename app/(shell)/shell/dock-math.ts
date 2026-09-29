// Perhitungan murni Dock (bisa dites tanpa DOM).

/**
 * Ukuran tiap ikon dari posisi X kursor: kurva cosinus di sekitar kursor (jangkauan `reach` px dari pusat ikon).
 * Kursor di luar Dock (null) → semua ukuran dasar. Ikon di bawah kursor ≈ max, tetangga terdekat ≈ separuh jalan.
 */
export function dockSizes(mouseX: number | null, centers: number[], base: number, max: number, reach = base * 2.4): number[] {
  if (mouseX === null) return centers.map(() => base);
  return centers.map((c) => {
    const d = Math.abs(mouseX - c);
    if (d >= reach) return base;
    const t = (Math.cos((d / reach) * Math.PI) + 1) / 2; // 1 di pusat → 0 di tepi jangkauan
    return Math.round((base + (max - base) * t) * 10) / 10;
  });
}

/** Posisi kiri panel selebar `width` yang berpusat di `anchorX`, dijepit ke dalam viewport dengan margin. */
export function clampPanelX(anchorX: number, width: number, viewport: number, margin = 12): number {
  const left = anchorX - width / 2;
  return Math.max(margin, Math.min(left, viewport - width - margin));
}

// Penanda warna baris Kertas Kerja (Mitra10 & RKM): anotasi manual bersama, tersimpan di tabel row_marks
// (migrasi 0040). Nilai yang disimpan semantik (blue/mint/lavender), bukan hex — warna tampilan dari token tema.
// Tidak menafsirkan/mengubah status GR, Tukar Faktur, nominal, atau Keterangan.

export const ROW_MARK_COLORS = ["blue", "mint", "lavender"] as const;
export type RowMarkColor = (typeof ROW_MARK_COLORS)[number];
export type RowMarkModule = "m10" | "rkm";
export type RowMark = { id: number; color: RowMarkColor };

export const ROW_MARK_LABEL: Record<RowMarkColor, string> = { blue: "Biru", mint: "Mint", lavender: "Lavender" };

export const isRowMarkColor = (v: unknown): v is RowMarkColor => ROW_MARK_COLORS.includes(v as RowMarkColor);

/** Ringkasan warna target: semua tanpa warna, semua satu warna, atau campuran. */
export type MarkSummary = { kind: "none" } | { kind: "single"; color: RowMarkColor } | { kind: "mixed" };
export function markSummary(ids: readonly number[], marks: ReadonlyMap<number, RowMarkColor>): MarkSummary {
  let first: RowMarkColor | null | undefined;
  for (const id of ids) {
    const c = marks.get(id) ?? null;
    if (first === undefined) first = c;
    else if (c !== first) return { kind: "mixed" };
  }
  return first ? { kind: "single", color: first } : { kind: "none" };
}

/** Terapkan (color) atau hapus (null) penanda pada ids — untuk pembaruan lokal sebelum server mengonfirmasi. */
export function applyMarks(list: readonly RowMark[], ids: readonly number[], color: RowMarkColor | null): RowMark[] {
  const target = new Set(ids);
  const kept = list.filter((m) => !target.has(m.id));
  if (!color) return kept;
  return [...kept, ...[...target].map((id) => ({ id, color }))].sort((a, b) => a.id - b.id);
}

/** Pesan kegagalan yang bisa ditindaklanjuti dari error RPC row_marks_set. */
export function markErrorMessage(e: { code?: string; message?: string } | null | undefined): string {
  if (e?.code === "42501") return "Warna tidak tersimpan: akun ini tidak punya akses ke menu ini.";
  if (e?.code === "P0002") return `Warna tidak tersimpan: ${e.message ?? "sebagian baris tidak ditemukan"}. Muat ulang halaman lalu coba lagi.`;
  if (e?.code === "22023") return `Warna tidak tersimpan: ${e.message ?? "permintaan tidak valid"}.`;
  return `Warna tidak tersimpan (${e?.message ?? "koneksi gagal"}). Periksa koneksi lalu coba lagi.`;
}

// Tanda Tolakan / LTKP / Litigasi per baris Kertas Kerja (Fase 82): anotasi manual bersama, tersimpan di tabel row_flags.
// Normal = tidak ada baris. Terpisah dari Keterangan — teks Keterangan tidak lagi ditafsirkan sebagai LTKP/Litigasi.

export const ROW_FLAGS = ["tolakan", "ltkp", "litigasi"] as const;
export type RowFlagValue = (typeof ROW_FLAGS)[number];
export type RowFlagModule = "m10" | "rkm";
export type RowFlag = { id: number; flag: RowFlagValue };

export type Tanda = "Normal" | "Tolakan" | "LTKP" | "Litigasi";
export const TANDA: Tanda[] = ["Normal", "Tolakan", "LTKP", "Litigasi"];
const LABEL: Record<RowFlagValue, Tanda> = { tolakan: "Tolakan", ltkp: "LTKP", litigasi: "Litigasi" };
export const tandaOf = (f: RowFlagValue | null | undefined): Tanda => (f ? LABEL[f] ?? "Normal" : "Normal");
export const flagOf = (t: Tanda): RowFlagValue | null => ROW_FLAGS.find((f) => LABEL[f] === t) ?? null;

/** Terapkan (flag) atau hapus (null = Normal) tanda pada ids — untuk pembaruan lokal sebelum server mengonfirmasi. */
export function applyFlags(list: readonly RowFlag[], ids: readonly number[], flag: RowFlagValue | null): RowFlag[] {
  const target = new Set(ids);
  const kept = list.filter((m) => !target.has(m.id));
  if (!flag) return kept;
  return [...kept, ...[...target].map((id) => ({ id, flag }))].sort((a, b) => a.id - b.id);
}

/** Pesan kegagalan yang bisa ditindaklanjuti dari error RPC row_flags_set. */
export function flagErrorMessage(e: { code?: string; message?: string } | null | undefined): string {
  if (e?.code === "42501") return "Tanda tidak tersimpan: akun ini tidak punya akses ke menu ini.";
  if (e?.code === "P0002") return `Tanda tidak tersimpan: ${e.message ?? "sebagian baris tidak ditemukan"}. Muat ulang halaman lalu coba lagi.`;
  if (e?.code === "22023") return `Tanda tidak tersimpan: ${e.message ?? "permintaan tidak valid"}.`;
  return `Tanda tidak tersimpan (${e?.message ?? "koneksi gagal"}). Periksa koneksi lalu coba lagi.`;
}

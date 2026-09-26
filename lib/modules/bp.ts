// Nama Business Partner ringkas: teks setelah " - " terakhir.
// "Catur Mitra Sejati Sentosa - Batam" → "Batam"; tanpa " - " → nama utuh.
export function bpShort(bp: string | null | undefined) {
  const s = (bp ?? "").trim();
  const i = s.lastIndexOf(" - ");
  return i >= 0 ? s.slice(i + 3).trim() : s;
}

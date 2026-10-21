// Export Detail Laporan Harian Kolektor (Fase 69): data mentah tukar faktur Done dari Aplikasi Kolektor per invoice —
// Business Partner, No Invoice, Kolektor, Kode Unik. Kode Unik dicap sekali per simpan di Aplikasi Kolektor; jumlah kode
// unik per hari = "Titik Lokasi" (tukarDays). Filter bulan & kolektor sama dengan tukarDays.

export type TukarDone = { tanggal_tukar: string | null; kurir: string | null; business_partner: string | null; invoice_no?: string | null; kode: string | null };

const kol = (k: string | null) => (k ?? "").trim() || "Tanpa Kolektor";
const txt = (v: string | null | undefined) => (v ?? "").trim();

export function tukarDetailSheets(done: TukarDone[], month: string, kurir: string) {
  const sel = done
    .filter((d) => d.tanggal_tukar?.slice(0, 7) === month && (!kurir || kol(d.kurir) === kurir))
    .map((d) => ({ tanggal: d.tanggal_tukar!, bp: txt(d.business_partner), inv: txt(d.invoice_no), kolektor: kol(d.kurir), kode: txt(d.kode) }))
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.kode.localeCompare(b.kode) || a.bp.localeCompare(b.bp) || a.inv.localeCompare(b.inv));

  // Titik lokasi dihitung per hari (sama dengan layar): kode yang sama di tanggal lain dihitung lagi.
  const groups = new Map<string, { kode: string; tanggal: string; kolektor: Set<string>; bp: Set<string>; inv: number }>();
  for (const r of sel) {
    if (!r.kode) continue;
    const key = `${r.tanggal}|${r.kode}`;
    const g = groups.get(key) ?? { kode: r.kode, tanggal: r.tanggal, kolektor: new Set(), bp: new Set(), inv: 0 };
    g.kolektor.add(r.kolektor); if (r.bp) g.bp.add(r.bp); g.inv++;
    groups.set(key, g);
  }
  const lokasi = [...groups.values()];

  const detail = [
    ["Tanggal Tukar", "Business Partner", "No Invoice", "Kolektor", "Kode Unik"],
    ...sel.map((r) => [r.tanggal, r.bp, r.inv, r.kolektor, r.kode]),
  ];
  const titik = [
    ["Kode Unik", "Tanggal", "Kolektor", "Jumlah BP", "Jumlah Invoice"],
    ...lokasi.map((g) => [g.kode, g.tanggal, [...g.kolektor].join(", "), g.bp.size, g.inv]),
    [],
    ["Total Titik Lokasi", lokasi.length],
    ["Total Invoice", sel.length],
  ];
  return { rows: sel.length, lokasi: lokasi.length, sheets: [{ name: "Detail", rows: detail }, { name: "Titik Lokasi", rows: titik }] };
}

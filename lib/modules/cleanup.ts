// Pembersihan database (Fase 47; Fase 48: semua penghapusan MANUAL, tidak ada lagi hapus otomatis saat upload Aging) —
// katalog kategori. Kunci HARUS sama dengan private.cleanup_candidates (migrasi 0046).
// group "aging"  = data yang relasinya ke Aging terbaru (invoice/SJ sudah lunas / tidak ada lagi di aging).
// group "teknis" = sisa proses (staging upload gagal, log).
// group "arsip"  = data riwayat berbasis umur: hanya baris SEBELUM tanggal batas (cutoff) yang menjadi kandidat.

export type CleanupGroup = "aging" | "teknis" | "arsip";
export type CleanupCategory = { key: string; label: string; desc: string; group: CleanupGroup; usesCutoff: boolean; risk?: string };

export const CLEANUP_CATEGORIES: readonly CleanupCategory[] = [
  { key: "keterangan", group: "aging", usesCutoff: false, label: "Keterangan invoice",
    desc: "Keterangan (Collection, Mitra10, RKM, Hold, impor lama) untuk SJ/invoice yang tidak ada di Aging terbaru." },
  { key: "tukar_ekspedisi", group: "aging", usesCutoff: false, label: "Tukar Faktur & Ekspedisi",
    desc: "Status tukar faktur (Kolektor, Ekspedisi/resi, WA, Email) untuk invoice yang sudah lunas." },
  { key: "laporan_kolektor", group: "aging", usesCutoff: false, label: "Laporan harian kolektor",
    desc: "Hasil kunjungan kolektor (Done/Pending) untuk invoice yang sudah lunas." },
  { key: "jadwal_kolektor", group: "aging", usesCutoff: false, label: "Jadwal kolektor",
    desc: "Jadwal tukar faktur yang invoicenya sudah tidak ada di Aging." },
  { key: "catatan", group: "aging", usesCutoff: false, label: "Catatan collection",
    desc: "Catatan (Reminder, No Respon, Case, Administratif) untuk invoice yang sudah lunas." },
  { key: "janji_bayar", group: "aging", usesCutoff: false, label: "Janji bayar", desc: "Janji bayar untuk invoice yang sudah lunas." },
  { key: "hold_faktur", group: "aging", usesCutoff: false, label: "Hold faktur pajak", desc: "Hold faktur pajak untuk invoice yang sudah lunas." },
  { key: "penerimaan_sj", group: "aging", usesCutoff: false, label: "Penerimaan SJ (Monitor SJ)",
    desc: "Receive Date & Receiver Monitor Surat Jalan untuk No SJ yang tidak ada lagi di Aging terbaru." },
  { key: "staging_upload", group: "teknis", usesCutoff: false, label: "Upload terbengkalai",
    desc: "Upload (Aging/ERP/Target) yang gagal atau ditinggal > 1 hari dan tidak pernah tersimpan. Aman dihapus." },
  { key: "riwayat_upload", group: "teknis", usesCutoff: true, label: "Riwayat upload",
    desc: "Catatan riwayat upload sebelum tanggal batas.", risk: "Checklist Pusat Upload memakai riwayat bulan berjalan — pilih tanggal batas sebelum bulan lalu." },
  { key: "log_login", group: "teknis", usesCutoff: true, label: "Log login & cek nama", desc: "Catatan percobaan login sebelum tanggal batas (pengaman login hanya memakai catatan maks. 1 jam terakhir)." },
  { key: "erp_pembayaran", group: "arsip", usesCutoff: true, label: "Pembayaran ERP",
    desc: "Pembayaran ERP dengan payment date sebelum tanggal batas.", risk: "Dipakai Mutasi Bank, Presentasi & History Pembayaran (3 bulan terakhir)." },
  { key: "erp_invoice", group: "arsip", usesCutoff: true, label: "Invoice ERP",
    desc: "Invoice ERP sebelum tanggal batas yang sudah tidak ada di Aging dan tidak punya pembayaran setelah tanggal batas.",
    risk: "Dipakai Mutasi Bank, Presentasi & Marketplace untuk bulan-bulan lama." },
  { key: "mutasi_bank", group: "arsip", usesCutoff: true, label: "Mutasi bank", desc: "Mutasi rekening sebelum tanggal batas.", risk: "Dashboard Mutasi bulan lama menjadi kosong." },
];

export const CLEANUP_GROUP_LABEL: Record<CleanupGroup, string> = {
  aging: "Tidak ada lagi di Aging (lunas)",
  teknis: "Sisa proses & log",
  arsip: "Arsip lama (berdasarkan tanggal batas)",
};

/** Tanggal batas bawaan: awal bulan, 6 bulan sebelum bulan berjalan (data 6 bulan terakhir aman). */
export function defaultCutoff(today: string) {
  const y = +today.slice(0, 4), m = +today.slice(5, 7) - 6;
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toISOString().slice(0, 10);
}

/** Pecah kunci per 5.000 agar satu permintaan tidak terlalu besar (server maks 50.000). */
export function chunkKeys(keys: readonly string[], size = 5000) {
  const out: string[][] = [];
  for (let i = 0; i < keys.length; i += size) out.push(keys.slice(i, i + size));
  return out;
}

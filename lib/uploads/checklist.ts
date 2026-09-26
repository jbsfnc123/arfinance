import { todayJakarta } from "@/lib/parsers/date";

// Checklist upload harian di Pusat Upload: file apa saja yang dibutuhkan tiap menu, dan apakah
// sudah di-upload pada periode berjalan (hari ini, atau bulan ini untuk data bulanan) — WIB.
// Status diambil dari import_log lewat RPC upload_status().

export type Period = "day" | "month";
export type FileKey =
  | "aging" | "erp_invoice" | "erp_payment" | "target" | "mutasi" | "jadwal_kolektor"
  | "m10_gr" | "m10_kw" | "m10_jadwal" | "rkm_gr" | "rkm_kw" | "so_master" | "marketplace";

export type FileDef = {
  label: string;
  match: { module: string; kind: string; detail?: string };
  period: Period;
  where: { label: string; href: string };
};

const PUSAT = { label: "Pusat Upload", href: "/pengaturan/upload" };

export const FILES: Record<FileKey, FileDef> = {
  aging: { label: "Master Aging (Blank_A4)", match: { module: "data", kind: "aging" }, period: "day", where: PUSAT },
  erp_invoice: { label: "Invoice ERP (Invoice & Payment Date Comparison)", match: { module: "data", kind: "erp", detail: "invoice" }, period: "day", where: PUSAT },
  erp_payment: { label: "Payment ERP (Invoice & Payment Date Comparison)", match: { module: "data", kind: "erp", detail: "payment" }, period: "day", where: PUSAT },
  target: { label: "Target bulanan", match: { module: "collection", kind: "target" }, period: "month", where: PUSAT },
  mutasi: { label: "Mutasi rekening bank", match: { module: "mutasi", kind: "mutasi" }, period: "day", where: PUSAT },
  jadwal_kolektor: { label: "Jadwal Kolektor", match: { module: "tukar_faktur", kind: "jadwal" }, period: "day", where: { label: "Upload Jadwal", href: "/tukar-faktur/upload" } },
  m10_gr: { label: "GR Report Detail (CSV)", match: { module: "mitra10", kind: "gr" }, period: "day", where: { label: "Mitra10 → Upload & Setting", href: "/mitra10" } },
  m10_kw: { label: "Invoice Summary / Kwitansi (CSV)", match: { module: "mitra10", kind: "kwitansi" }, period: "day", where: { label: "Mitra10 → Upload & Setting", href: "/mitra10" } },
  m10_jadwal: { label: "Jadwal Bayar", match: { module: "mitra10", kind: "jadwal" }, period: "day", where: { label: "Mitra10 → Upload & Setting", href: "/mitra10" } },
  rkm_gr: { label: "GR RKM", match: { module: "rkm", kind: "gr" }, period: "day", where: { label: "RKM → Upload & Setting", href: "/rkm" } },
  rkm_kw: { label: "Kwitansi RKM", match: { module: "rkm", kind: "kwitansi" }, period: "day", where: { label: "RKM → Upload & Setting", href: "/rkm" } },
  so_master: { label: "SO Master", match: { module: "cek_harga", kind: "so_master" }, period: "day", where: { label: "Cek Selisih Harga", href: "/cek-harga" } },
  marketplace: { label: "Laporan Marketplace", match: { module: "marketplace", kind: "report" }, period: "day", where: { label: "Marketplace", href: "/marketplace" } },
};

// Urutan tampil ke bawah: nama menu → file yang dibutuhkan.
export const CHECKLIST: { menu: string; files: FileKey[] }[] = [
  { menu: "Collection (Daftar Tagihan & Dashboard)", files: ["aging", "target"] },
  { menu: "Dashboard Mutasi Bank vs Realisasi", files: ["mutasi", "erp_invoice", "erp_payment", "target"] },
  { menu: "Tukar Faktur – Jadwal Kolektor", files: ["jadwal_kolektor"] },
  { menu: "Mitra10 Tukar Faktur", files: ["aging", "m10_gr", "m10_kw", "m10_jadwal"] },
  { menu: "RKM Tukar Faktur", files: ["aging", "rkm_gr", "rkm_kw"] },
  { menu: "Cek Selisih Harga PO/SO", files: ["so_master"] },
  { menu: "Marketplace", files: ["marketplace"] },
];

export type UploadStat = { module: string; kind: string; detail: string | null; at: string; file: string | null; by: string | null };

// Catatan terakhir untuk satu file. ERP: catatan lama (sebelum ada detail invoice/payment) dipakai
// sebagai cadangan bila belum ada catatan dengan detail.
export function lastOf(def: FileDef, stats: UploadStat[]): UploadStat | null {
  const same = stats.filter((s) => s.module === def.match.module && s.kind === def.match.kind);
  const exact = def.match.detail ? same.filter((s) => s.detail === def.match.detail) : same;
  const pool = exact.length ? exact : def.match.detail ? same.filter((s) => !s.detail) : [];
  return pool.reduce<UploadStat | null>((a, s) => (!a || s.at > a.at ? s : a), null);
}

// Sudah di-upload pada periode berjalan (WIB)? Ganti hari/bulan → otomatis kembali silang.
export function isFresh(lastAt: string | null | undefined, period: Period, now = new Date()) {
  if (!lastAt) return false;
  const last = todayJakarta(new Date(lastAt));
  const today = todayJakarta(now);
  return period === "day" ? last === today : last.slice(0, 7) === today.slice(0, 7);
}

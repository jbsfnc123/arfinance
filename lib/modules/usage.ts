// Kuota paket Supabase yang dipakai project (organisasi paket Free, 2026-09).
// Ubah angka di sini bila paket di-upgrade.
export const SUPABASE_PLAN = "Free";
export const QUOTA = {
  dbBytes: 500 * 1024 ** 2,        // Database 500 MB
  storageBytes: 1024 ** 3,         // File storage 1 GB
  mau: 50_000,                     // Monthly active users
  egressBytes: 5 * 1024 ** 3,      // Egress 5 GB / bulan (hanya terlihat di dashboard Supabase)
  uploadBytes: 50 * 1024 ** 2,     // Maks. ukuran satu file upload
};
export const SUPABASE_USAGE_URL = "https://supabase.com/dashboard/project/knytaubhwnahnpamkhgz/settings/usage";

export type UsageReport = {
  dbBytes: number;
  tables: { name: string; bytes: number; rows: number }[];
  storage: { bucket: string; files: number; bytes: number }[];
  users: number; activeUsers30d: number; connections: number; at: string;
};

// Pemakaian vs kuota: persen, sisa, dan warna status (hijau < 70%, kuning 70–90%, merah > 90%).
export function quotaState(used: number, quota: number) {
  const pct = quota > 0 ? used / quota : 0;
  return { used, quota, left: Math.max(0, quota - used), pct, level: pct > 0.9 ? "danger" : pct >= 0.7 ? "warning" : "success" } as const;
}

export function fmtBytes(n: number) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toLocaleString("id-ID", { maximumFractionDigits: 2 })} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB`;
  if (n >= 1024) return `${(n / 1024).toLocaleString("id-ID", { maximumFractionDigits: 0 })} KB`;
  return `${n} B`;
}

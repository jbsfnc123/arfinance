// Dataset arsip Google Drive (Fase 66). Dipakai server (route /api/archive/*) dan klien (halaman Arsip Data, penarikan
// otomatis). Aturan baris mana yang boleh diarsip ada di database: private.archive_rows (migrasi 20261011100000).

export type ArchiveDataset = "erp_payments" | "erp_invoices" | "aging_snapshot" | "ar_targets" | "bank_mutations";

export type ArchiveDatasetInfo = {
  id: ArchiveDataset;
  label: string;
  /** Kunci unik baris (penggabungan arsip ulang). */
  key: (r: Record<string, unknown>) => string;
  /** Urutan arsip: Pembayaran dulu — invoice baru jadi kandidat setelah pembayarannya diarsip. */
  order: number;
  /** Periode = bulan (YYYY-MM) atau id snapshot Aging. */
  period: "month" | "snapshot";
};

export const ARCHIVE_DATASETS: readonly ArchiveDatasetInfo[] = [
  { id: "erp_payments", label: "Pembayaran ERP", key: (r) => String(r.id), order: 1, period: "month" },
  { id: "erp_invoices", label: "Invoice ERP", key: (r) => String(r.invoice_no), order: 2, period: "month" },
  { id: "aging_snapshot", label: "Snapshot Aging", key: (r) => String(r.line_no), order: 3, period: "snapshot" },
  { id: "ar_targets", label: "Target Collection", key: (r) => String(r.invoice_no), order: 4, period: "month" },
  { id: "bank_mutations", label: "Mutasi Bank", key: (r) => String(r.id), order: 5, period: "month" },
];

export const archiveInfo = (id: string) => ARCHIVE_DATASETS.find((d) => d.id === id);
export const isArchiveDataset = (id: unknown): id is ArchiveDataset => typeof id === "string" && !!archiveInfo(id);

/** Isi satu file arsip (.json.gz). */
export type ArchiveFile = {
  v: 1;
  dataset: ArchiveDataset;
  period: string;
  label: string | null;
  exportedAt: string;
  rows: Record<string, unknown>[];
};

/** Entri indeks arsip (public.archive_list). */
export type ArchiveEntry = {
  id: number;
  dataset: ArchiveDataset;
  period: string;
  label: string | null;
  rows: number;
  bytes: number;
  createdAt: string;
  purgedAt: string | null;
  fileName: string;
};

/** Kandidat arsip (public.archive_candidates). */
export type ArchiveCandidate = {
  dataset: ArchiveDataset;
  period: string;
  label: string | null;
  rows: number;
  amount: number;
  archived: { id: number; rows: number; at: string } | null;
};

/**
 * Gabungkan baris arsip lama dengan baris baru dari database (arsip ulang periode yang sama, mis. setelah upload ulang ERP).
 * Baris baru menggantikan baris lama berkunci sama; urutan mengikuti kunci.
 */
export function mergeArchiveRows(dataset: ArchiveDataset, older: Record<string, unknown>[], newer: Record<string, unknown>[]) {
  const key = archiveInfo(dataset)!.key;
  const map = new Map<string, Record<string, unknown>>();
  for (const r of older) map.set(key(r), r);
  for (const r of newer) map.set(key(r), r);
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, r]) => r);
}

/** Nama file arsip: "<periode> <YYYYMMDD-HHmmss>.json.gz" (versi baru tidak menimpa file lama). */
export function archiveFileName(period: string, at = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${at.getUTCFullYear()}${p(at.getUTCMonth() + 1)}${p(at.getUTCDate())}-${p(at.getUTCHours())}${p(at.getUTCMinutes())}${p(at.getUTCSeconds())}`;
  return `${period.replace(/[^\w-]/g, "_")} ${stamp}.json.gz`;
}

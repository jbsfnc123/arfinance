// Hapus Data Upload per periode (Fase 71) — tipe & bantu murni untuk kartu di Pengaturan › Arsip Data.
// Sumber kebenaran ada di database: private.upload_ds + RPC upload_data_overview / upload_data_export / upload_data_delete.

export type UploadPeriod = { period: string; rows: number; amount: number; locked: string | null; archived: boolean };
export type UploadDataset = { dataset: string; label: string; unit: string; hasAmount: boolean; periods: UploadPeriod[] };

/** Dataset di Hapus Data Upload → dataset arsip Google Drive (opsi "hapus juga arsip"). */
export const ARCHIVE_OF: Record<string, string> = {
  mutasi: "bank_mutations", erp_payments: "erp_payments", erp_invoices: "erp_invoices", targets: "ar_targets", aging: "aging_snapshot",
};

/** Label periode: 2026-09 → "September 2026"; "semua" → "Semua data". */
export function periodLabel(p: string) {
  if (p === "semua") return "Semua data";
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  if (!m) return p;
  const names = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  return `${names[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** Teks yang harus diketik untuk mengaktifkan tombol hapus. */
export const confirmText = (p: string) => (p === "semua" ? "HAPUS SEMUA" : p);

/** Baris JSON (dari upload_data_export) → sheet Excel (kolom gabungan, objek di-JSON-kan). */
export function rowsToSheet(rows: Record<string, unknown>[]): unknown[][] {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return [cols, ...rows.map((r) => cols.map((c) => { const v = r[c]; return v !== null && typeof v === "object" ? JSON.stringify(v) : v; }))];
}

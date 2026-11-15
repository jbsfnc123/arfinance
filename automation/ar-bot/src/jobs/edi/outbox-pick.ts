// Outbox Invoice (EDI Mitra 10): keputusan per batch Create Kuitansi. Fungsi murni — diuji tanpa browser.
// Aturan user: tampilkan 100 entries → centang semua → Create Kuitansi → OK; ulangi sampai list habis.

export type OutboxRow = { id: string; docNo: string; pfiNo: string; vendorInvoiceNo: string; invoiceDate: string; totalNet: string };

export type BatchDecision = "done" | "stuck" | "limit" | "go";

/** Batas pengaman jumlah batch per akun (100 invoice/batch → 5.000 invoice). */
export const MAX_BATCH = 50;

/**
 * `prev` = id baris batch sebelumnya yang sudah dicoba (null untuk batch pertama), `now` = id baris saat ini.
 * done  = list kosong;
 * stuck = sesudah Create Kuitansi semua baris batch sebelumnya masih ada (EDI menolak) → berhenti agar tidak berputar;
 * limit = batas batch tercapai; go = lanjut.
 */
export function nextBatchDecision(prev: string[] | null, now: string[], batch: number, maxBatch = MAX_BATCH): BatchDecision {
  if (!now.length) return "done";
  if (prev && prev.length && prev.every((id) => now.includes(id))) return "stuck";
  if (batch >= maxBatch) return "limit";
  return "go";
}

/** Pesan SweetAlert sesudah Create Kuitansi (json.message dari EDI). Sukses bila tidak berisi kata gagal/batal. */
export const isKuitansiSuccess = (msg: string) => !!msg.trim() && !/gagal|failed|error|dibatalkan|silahkan pilih|silakan pilih/i.test(msg);

/** Label batch untuk log: beberapa Document No · Vendor Invoice No pertama, sisanya diringkas. */
export function batchLabel(rows: OutboxRow[], show = 3) {
  const head = rows.slice(0, show).map((r) => `${r.docNo}${r.vendorInvoiceNo ? ` (${r.vendorInvoiceNo})` : ""}`).join(", ");
  return rows.length > show ? `${head} … +${rows.length - show} lainnya` : head;
}

// Invoice Inbox (EDI Mitra 10): pilih baris untuk Create Invoice. Fungsi murni — diuji tanpa browser.
// Aturan user: centang SATU baris berurutan dari paling atas yang statusnya Completed; baris lain dilewati.

export type InboxRow = { id: string; docNo: string; status: string; poNo: string; sj: string };

export const isCompleted = (status: string) => status.trim().toLowerCase() === "completed";

/**
 * Baris teratas berstatus Completed yang belum dicoba pada run ini (`tried` = id). `skipped` = baris di atasnya yang bukan
 * Completed (untuk log). null bila tidak ada lagi.
 */
export function nextCompleted(rows: InboxRow[], tried: Set<string>): { row: InboxRow | null; skipped: InboxRow[] } {
  const skipped: InboxRow[] = [];
  for (const r of rows) {
    if (tried.has(r.id)) continue;
    if (isCompleted(r.status)) return { row: r, skipped };
    skipped.push(r);
  }
  return { row: null, skipped };
}

/** Pesan SweetAlert setelah Create Invoice: sukses = "Proses sukses! Document Invoice berada di menu Draft". */
export const isSuccess = (msg: string) => /sukses|success|berhasil/i.test(msg);

/** Batas invoice per run: 0 / kosong = semua (dibatasi 200 sebagai pengaman). */
export const inboxLimit = (v: unknown) => {
  const n = Math.floor(Number(v) || 0);
  return n <= 0 ? 200 : Math.min(n, 200);
};

/** Label satu baris di log. */
export const rowLabel = (r: InboxRow) => `${r.docNo} · PO ${r.poNo || "-"} · SJ ${r.sj || "-"}`;

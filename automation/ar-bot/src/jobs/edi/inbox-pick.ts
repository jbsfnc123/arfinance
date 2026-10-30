// Invoice Inbox (EDI Mitra 10): pilih baris untuk Create Invoice. Fungsi murni — diuji tanpa browser.
// Aturan user:
//   Completed → centang SATU baris berurutan dari paling atas yang statusnya Completed, Create Invoice; baris lain dilewati.
//   New       → buka (klik Document No) baris New teratas, Accept; ulangi sampai status New habis.

export type InboxRow = { id: string; docNo: string; status: string; poNo: string; sj: string };

export const isCompleted = (status: string) => status.trim().toLowerCase() === "completed";
export const hasStatus = (status: string, want: string) => status.trim().toLowerCase() === want.trim().toLowerCase();

export type InboxMode = "completed" | "new";
/** Teks opsi Status di EDI untuk tiap mode. */
export const MODE_STATUS: Record<InboxMode, string> = { completed: "Completed", new: "New" };
export const inboxModeOf = (v: unknown): InboxMode => (v === "new" ? "new" : "completed");

/**
 * Baris teratas berstatus Completed yang belum dicoba pada run ini (`tried` = id). `skipped` = baris di atasnya yang bukan
 * Completed (untuk log). null bila tidak ada lagi.
 */
export function nextCompleted(rows: InboxRow[], tried: Set<string>) { return nextWithStatus(rows, tried, "Completed"); }

/** Baris teratas berstatus `status` (tanpa beda huruf besar/kecil) yang belum dicoba; `skipped` = baris di atasnya berstatus lain. */
export function nextWithStatus(rows: InboxRow[], tried: Set<string>, status: string): { row: InboxRow | null; skipped: InboxRow[] } {
  const skipped: InboxRow[] = [];
  for (const r of rows) {
    if (tried.has(r.id)) continue;
    if (hasStatus(r.status, status)) return { row: r, skipped };
    skipped.push(r);
  }
  return { row: null, skipped };
}

/** Pesan SweetAlert setelah Create Invoice: sukses = "Proses sukses! Document Invoice berada di menu Draft". */
export const isSuccess = (msg: string) => /sukses|success|berhasil/i.test(msg);
/** Pesan SweetAlert setelah Accept: sukses = "Proses accept sukses! Document PFI berada di menu Outbox, menunggu proses Posted!". */
export const isAcceptSuccess = (msg: string) => !/dibatalkan|gagal|failed|error/i.test(msg) && /sukses|success|berhasil/i.test(msg);

/** Batas invoice per run: 0 / kosong = semua (dibatasi 200 sebagai pengaman). */
export const inboxLimit = (v: unknown) => {
  const n = Math.floor(Number(v) || 0);
  return n <= 0 ? 200 : Math.min(n, 200);
};

/** Label satu baris di log. */
export const rowLabel = (r: InboxRow) => `${r.docNo} · PO ${r.poNo || "-"} · SJ ${r.sj || "-"}`;

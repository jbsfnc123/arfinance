// Mitra10 › BOT (Fase 93): katalog 5 job EDI bot cloud (repo ARBOT) + bantu baca riwayat bot_runs. Fungsi murni.
import type { FakturItem } from "./faktur";

export type BotJobId = "edi.gr" | "edi.kwitansi" | "edi.invoice-inbox" | "edi.outbox-invoice" | "edi.upload-faktur";

export type BotParams = {
  push?: boolean;
  start?: string;
  end?: string;
  /** Username EDI; kosong = semua akun aktif (Upload Faktur: akun pertama saja). */
  accounts?: string[];
  inboxMode?: "completed" | "new";
  limit?: number;
  mode?: "draft" | "not_found" | "fill";
  items?: unknown[];
};

export type BotJobDef = { id: BotJobId; label: string; short: string; icon: string; write: boolean; desc: string };

// Nama di AR Workspace (berbeda dari AR Bot lokal): GR Report Detail → Update Receiving, dst.
export const BOT_JOBS: BotJobDef[] = [
  { id: "edi.gr", label: "Update Receiving", short: "Receiving", icon: "inventory", write: false,
    desc: "Unduh GR Report Detail dari EDI lalu tambahkan GR baru ke data Receiving." },
  { id: "edi.kwitansi", label: "Update Kwitansi", short: "Kwitansi", icon: "receipt_long", write: false,
    desc: "Unduh Invoice Summary (Kwitansi) satu bulan dari EDI lalu tambahkan kwitansi baru." },
  { id: "edi.invoice-inbox", label: "Inbox New/Completed", short: "Inbox", icon: "inventory_2", write: true,
    desc: "Completed → Create Invoice (masuk Draft), atau New → Accept PFI, di Inbox EDI." },
  { id: "edi.outbox-invoice", label: "Outbox Create Kuitansi", short: "Outbox", icon: "receipt_check", write: true,
    desc: "Centang semua invoice di Outbox EDI lalu Create Kuitansi, diulang sampai list habis." },
  { id: "edi.upload-faktur", label: "Upload Faktur Pajak", short: "Faktur", icon: "upload_file", write: true,
    desc: "Unggah Faktur Pajak Coretax (PDF dipecah di browser) atau isi No Invoice di Draft EDI." },
];
export const botJob = (id: BotJobId) => BOT_JOBS.find((j) => j.id === id)!;

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Param bawaan (sama dengan AR Bot): Receiving 30 hari terakhir, Kwitansi bulan ini, Inbox Completed tanpa batas. */
export function defaultParams(id: BotJobId, today: string): BotParams {
  switch (id) {
    case "edi.gr": return { push: true, start: addDays(today, -30), end: today };
    case "edi.kwitansi": return { push: true, start: `${today.slice(0, 7)}-01`, end: today };
    case "edi.invoice-inbox": return { inboxMode: "completed", limit: 0 };
    case "edi.upload-faktur": return { mode: "draft" };
    default: return {};
  }
}

/** Teks konfirmasi aksi tulis di EDI (dari AR Bot lokal). */
export function confirmText(id: BotJobId, p: BotParams, n = 0) {
  const akun = p.accounts?.length ? `${p.accounts.length} akun` : "semua akun aktif";
  switch (id) {
    case "edi.outbox-invoice":
      return `Bot akan membuka Outbox › Invoice, mencentang semua invoice lalu menekan Create Kuitansi, dan mengulanginya sampai list habis (${akun}). Tindakan ini tidak bisa dibatalkan — jalankan Uji Coba dulu untuk melihat jumlah invoice.`;
    case "edi.invoice-inbox":
      return p.inboxMode === "new"
        ? `Bot akan membuka Document No lalu menekan Accept satu per satu untuk PFI berstatus New di Inbox EDI Mitra 10 (${akun}${p.limit ? `, maks. ${p.limit} per akun` : ""}). Tindakan ini tidak bisa dibatalkan — jalankan Uji Coba dulu bila ragu.`
        : `Bot akan menekan Create Invoice satu per satu untuk baris berstatus Completed di Inbox EDI Mitra 10 (${akun}${p.limit ? `, maks. ${p.limit} per akun` : ""}). Tindakan ini tidak bisa dibatalkan — jalankan Uji Coba dulu bila ragu.`;
    case "edi.upload-faktur":
      return p.mode === "fill"
        ? `${n} invoice akan diisi No Invoice-nya (Vendor Invoice No) di Draft EDI tanpa upload FP. Tindakan ini tidak bisa dibatalkan.`
        : `${n} faktur akan diunggah & dikirim (Send) ke Draft EDI Mitra 10, mode ${p.mode === "not_found" ? "Isi No Invoice+Upload FP" : "Upload FP"}. PDF hanya transit sementara di server bot dan dihapus setelah run selesai. Tindakan ini tidak bisa dibatalkan.`;
    default: return "";
  }
}

export type RunStatus = "queued" | "running" | "success" | "partial" | "failed" | "cancelled";
export type JobResult = { id: BotJobId; status: string; summary?: string; rows?: number; pushed?: boolean; error?: string; startedAt?: string; finishedAt?: string };
export type ItemResult = { invoice: string; status: string; ok: boolean };
export type BotRun = {
  id: number;
  jobs: { id: BotJobId; params?: BotParams }[];
  dry_run: boolean;
  status: RunStatus;
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  result: { jobs?: JobResult[]; items?: ItemResult[] } | null;
  log_tail: string | null;
  error: string | null;
  mine: boolean;
  requested_name: string;
};

export const isActive = (s: RunStatus) => s === "queued" || s === "running";
export const STATUS_LABEL: Record<RunStatus, string> = {
  queued: "Menunggu", running: "Berjalan", success: "Selesai", partial: "Sebagian gagal", failed: "Gagal", cancelled: "Dibatalkan",
};

/** Run terbaru yang memuat job ini (riwayat sudah urut terbaru dulu). */
export const lastRunFor = (runs: BotRun[], id: BotJobId) => runs.find((r) => r.jobs.some((j) => j.id === id)) ?? null;
export const jobResultOf = (run: BotRun | null, id: BotJobId) => run?.result?.jobs?.find((j) => j.id === id) ?? null;

/** Durasi "1 mnt 48 dtk" (run selesai) atau sejak mulai (run berjalan). */
export function duration(run: Pick<BotRun, "started_at" | "finished_at" | "requested_at">, now = Date.now()) {
  const a = Date.parse(run.started_at ?? run.requested_at), b = run.finished_at ? Date.parse(run.finished_at) : now;
  const s = Math.max(0, Math.round((b - a) / 1000));
  return s >= 60 ? `${Math.floor(s / 60)} mnt ${s % 60} dtk` : `${s} dtk`;
}

/** Ringkasan satu run: "Update Receiving: 4/4 akun · 0 GR baru". */
export function runSummary(run: BotRun) {
  const res = run.result?.jobs ?? [];
  return run.jobs.map((j) => {
    const r = res.find((x) => x.id === j.id);
    const text = r?.error ?? r?.summary ?? (isActive(run.status) ? "…" : "-");
    return `${botJob(j.id)?.short ?? j.id}: ${text}`;
  }).join(" · ");
}

/** Gabungkan status hasil run ke daftar faktur lokal (hanya run sungguhan, bukan uji coba). */
export function mergeItemStatus<T extends { invoice: string; status: string }>(items: T[], results: ItemResult[]): T[] {
  const by = new Map(results.map((r) => [r.invoice.toUpperCase(), r.status]));
  return items.map((i) => (by.has(i.invoice.toUpperCase()) ? { ...i, status: by.get(i.invoice.toUpperCase())! } : i));
}

/** Antrean Upload Faktur sesuai mode (sama dengan AR Bot: tercentang & belum terunggah; not_found → butuh status/No PO). */
export function fakturQueue(items: FakturItem[], mode: BotParams["mode"]) {
  return items.filter((i) => i.checked !== false && !(i.status ?? "").startsWith("Uploaded") &&
    (mode === "not_found" ? i.status === "Not Found in Draft" || !!i.no_po : true));
}

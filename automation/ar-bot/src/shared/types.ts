// Tipe bersama server, runner, dan UI AR Bot.

export type JobId =
  | "jasper.aging" | "jasper.send-invoice" | "jasper.sj" | "jasper.invoice-by-date"
  | "edi.gr" | "edi.kwitansi" | "edi.upload-faktur" | "edi.invoice-inbox" | "edi.outbox-invoice";

export type JobGroup = "jasper" | "edi";

export type JobParams = {
  /** Kirim hasil ke database AR Workspace. */
  push?: boolean;
  /** Serah Terima SJ: jumlah hari ke belakang (termasuk hari ini). */
  days?: number;
  /** Rentang tanggal (YYYY-MM-DD); kosong = bawaan job. */
  start?: string;
  end?: string;
  /** EDI: id akun yang dipakai; kosong = semua akun aktif. */
  accounts?: string[];
  /** Upload Faktur: mode "Not Found in Draft". */
  mode?: "draft" | "not_found" | "fill";
  /** Invoice Inbox: maks. dokumen diproses per akun per run (0 = semua, dibatasi 200). */
  limit?: number;
  /** Invoice Inbox: completed = Create Invoice dari status Completed; new = Accept PFI berstatus New. */
  inboxMode?: "completed" | "new";
  /** Aging Detail: Statement Date cut off akhir bulan (YYYY-MM-DD) — hanya unduh, tidak dikirim. Tidak disimpan di config. */
  cutoffs?: string[];
};

export type JobSpec = { id: JobId; params?: JobParams };

export type RunRequest = {
  jobs: JobSpec[];
  /** Unduh & baca saja (tanpa kirim ke database / unggah). */
  dryRun?: boolean;
  /** Kirim walau file identik dengan kiriman sukses terakhir. */
  force?: boolean;
  /** Jalankan semua job bersamaan (browser context per job). */
  parallel?: boolean;
  trigger: "manual" | "schedule";
  chainId?: string;
  chainName?: string;
};

export type JobStatus = "pending" | "running" | "ok" | "skipped" | "failed" | "cancelled";
export type RunStatus = "running" | "ok" | "partial" | "failed" | "cancelled";

export type JobResult = {
  id: JobId;
  status: JobStatus;
  startedAt?: string;
  finishedAt?: string;
  /** Ringkasan singkat (mis. "22.108 baris · terkirim"). */
  summary?: string;
  files?: string[];
  error?: string;
  shot?: string;
  rows?: number;
  pushed?: boolean;
};

export type RunEvent =
  | { t: "start"; at: string; runId: string; request: RunRequest; pid: number }
  | { t: "log"; at: string; level: "info" | "warn" | "error" | "ok"; msg: string; job?: JobId }
  | { t: "job"; at: string; result: JobResult }
  | { t: "end"; at: string; status: RunStatus };

export type RunRecord = {
  runId: string;
  trigger: RunRequest["trigger"];
  chainName?: string;
  dryRun?: boolean;
  parallel?: boolean;
  startedAt: string;
  finishedAt?: string;
  status: RunStatus;
  jobs: JobResult[];
};

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // ISO: 1 = Senin … 7 = Minggu

export type Chain = {
  id: string;
  name: string;
  jobs: JobSpec[];
  schedule: { enabled: boolean; days: Weekday[]; time: string };
};

export type EdiAccount = { id: string; label: string; username: string; active: boolean };

export type Config = {
  browser: { channel: "auto" | "edge" | "chrome"; headless: boolean };
  retentionDays: number;
  /** Folder pilihan user: file unduhan disalin ke <downloadDir>\<label menu>\ (kosong = tidak disalin). */
  downloadDir: string;
  /** loginUrl: halaman login Jaspersoft (bisa diubah bila domain pindah). */
  jasper: { username: string; organization: string; loginUrl: string };
  arw: { supabaseUrl: string; anonKey: string; botEmail: string };
  /** amountTolerance: toleransi selisih Open Amt (Rp) saat verifikasi Upload Faktur (bawaan 100). */
  /** loginUrl: halaman login EDI; menu Invoices/Outbox memakai domain (origin) yang sama. */
  edi: { accounts: EdiAccount[]; amountTolerance: number; loginUrl: string };
  jobs: Partial<Record<JobId, JobParams>>;
  chains: Chain[];
  theme: "system" | "light" | "dark";
  /** Pilihan terakhir kartu "Jalankan beberapa task" di Dashboard. */
  /** jobs = task tercentang; order = urutan semua task di kartu (diseret user) = urutan jalan. */
  multi: { jobs: JobId[]; parallel: boolean; order: JobId[] };
};

/** Nama rahasia yang disimpan terenkripsi (DPAPI). Password EDI: `edi:<id akun>`. */
export type SecretKey = "jasperPassword" | "botPassword" | `edi:${string}`;
export type Secrets = Partial<Record<SecretKey, string>>;

/** Status yang dikirim ke UI (tanpa nilai rahasia). */
export type PublicState = {
  version: string;
  config: Config;
  secretsSet: SecretKey[];
  active: { runId: string; trigger: RunRequest["trigger"]; startedAt: string; jobs: JobSpec[]; chainName?: string } | null;
  browser: { path: string | null; name: string | null };
  dataDir: string;
};

// Daftar job, nilai bawaan konfigurasi, dan utilitas jadwal (dipakai server, runner, dan UI).
import type { Chain, Config, JobId, JobParams, Weekday } from "./types";

export type JobInfo = {
  id: JobId;
  group: "jasper" | "edi";
  label: string;
  short: string;
  icon: string;
  /** Bisa dikirim ke AR Workspace. */
  pushable: boolean;
  /** Format file hasil. */
  format: "Excel" | "CSV" | "PDF";
  /** Butuh konfirmasi sebelum dijalankan sungguhan (aksi tulis di situs luar). */
  confirm?: boolean;
  /** Label pendek untuk menu samping (bila label penuh terlalu panjang). */
  nav?: string;
};

export const JOBS: readonly JobInfo[] = [
  { id: "jasper.aging", group: "jasper", label: "Aging Detail", short: "Aging", icon: "receipt_long", pushable: true, format: "Excel" },
  { id: "jasper.send-invoice", group: "jasper", label: "Send Invoice To Customer", short: "Jadwal TF", icon: "local_shipping", pushable: true, format: "CSV" },
  { id: "jasper.sj", group: "jasper", label: "Serah Terima Surat Jalan", short: "Surat Jalan", icon: "task_alt", pushable: true, format: "CSV" },
  { id: "jasper.invoice-by-date", group: "jasper", label: "Invoice & Payment Date Comparison", short: "Invoice by Date", nav: "Invoice by Date", icon: "payments", pushable: true, format: "Excel" },
  { id: "edi.gr", group: "edi", label: "GR Report Detail", short: "GR Report", icon: "download", pushable: false, format: "CSV" },
  { id: "edi.kwitansi", group: "edi", label: "Download Kwitansi", short: "Kwitansi", icon: "receipt_long", pushable: false, format: "CSV" },
  { id: "edi.upload-faktur", group: "edi", label: "Upload Faktur Pajak", short: "Upload Faktur", icon: "upload_file", pushable: false, format: "PDF", confirm: true },
];

export const jobInfo = (id: JobId) => JOBS.find((j) => j.id === id)!;

export const DEFAULT_PARAMS: Record<JobId, JobParams> = {
  "jasper.aging": { push: true },
  "jasper.send-invoice": { push: true },
  "jasper.sj": { push: true, days: 7 },
  "jasper.invoice-by-date": { push: false },
  "edi.gr": {},
  "edi.kwitansi": {},
  "edi.upload-faktur": { mode: "draft" },
};

export const DEFAULT_CHAIN: Chain = {
  id: "harian-ar",
  name: "Harian AR",
  jobs: [{ id: "jasper.aging" }, { id: "jasper.send-invoice" }, { id: "jasper.sj" }],
  schedule: { enabled: false, days: [1, 2, 3, 4, 5], time: "10:00" },
};

export function defaultConfig(): Config {
  return {
    browser: { channel: "auto", headless: true },
    retentionDays: 30,
    jasper: { username: "", organization: "Penguin Trading" },
    arw: { supabaseUrl: "", anonKey: "", botEmail: "" },
    drive: { enabled: true, url: "" },
    edi: { accounts: [] },
    jobs: {},
    chains: [DEFAULT_CHAIN],
    theme: "system",
  };
}

/** Gabungkan konfigurasi tersimpan dengan bawaan (kunci baru di versi baru tetap terisi). */
export function mergeConfig(saved: Partial<Config> | null | undefined): Config {
  const d = defaultConfig();
  if (!saved) return d;
  return {
    ...d, ...saved,
    browser: { ...d.browser, ...saved.browser },
    jasper: { ...d.jasper, ...saved.jasper },
    arw: { ...d.arw, ...saved.arw },
    drive: { ...d.drive, ...saved.drive },
    edi: { accounts: saved.edi?.accounts ?? [] },
    jobs: { ...saved.jobs },
    chains: saved.chains?.length ? saved.chains : d.chains,
  };
}

export const paramsFor = (cfg: Config, id: JobId, override?: JobParams): JobParams => ({ ...DEFAULT_PARAMS[id], ...cfg.jobs[id], ...override });

export const WEEKDAYS: { d: Weekday; short: string; ps: string }[] = [
  { d: 1, short: "Sen", ps: "Monday" }, { d: 2, short: "Sel", ps: "Tuesday" }, { d: 3, short: "Rab", ps: "Wednesday" },
  { d: 4, short: "Kam", ps: "Thursday" }, { d: 5, short: "Jum", ps: "Friday" }, { d: 6, short: "Sab", ps: "Saturday" }, { d: 7, short: "Min", ps: "Sunday" },
];

export const validTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/**
 * Waktu jalan berikutnya (waktu lokal PC) setelah `from`, atau null bila jadwal mati / tanpa hari.
 * Task Scheduler Windows memakai jam lokal PC, jadi perhitungan ini juga lokal.
 */
export function nextRun(s: Chain["schedule"], from: Date = new Date()): Date | null {
  if (!s.enabled || !s.days.length || !validTime(s.time)) return null;
  const [h, m] = s.time.split(":").map(Number);
  for (let i = 0; i < 8; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, h, m, 0, 0);
    const iso = (((d.getDay() + 6) % 7) + 1) as Weekday;
    if (s.days.includes(iso) && d > from) return d;
  }
  return null;
}

/** Ganti setiap kemunculan nilai rahasia (≥ 4 karakter) dengan ●●●. */
export function redact(text: string, secrets: (string | undefined)[]) {
  let out = text;
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join("●●●");
  return out;
}

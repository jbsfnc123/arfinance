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
  { id: "edi.gr", group: "edi", label: "GR Report Detail", short: "GR Report", icon: "download", pushable: true, format: "CSV" },
  { id: "edi.kwitansi", group: "edi", label: "Download Kwitansi", short: "Kwitansi", icon: "receipt_long", pushable: true, format: "CSV" },
  { id: "edi.upload-faktur", group: "edi", label: "Upload Faktur Pajak", short: "Upload Faktur", icon: "upload_file", pushable: false, format: "PDF", confirm: true },
];

export const jobInfo = (id: JobId) => JOBS.find((j) => j.id === id)!;

export const DEFAULT_PARAMS: Record<JobId, JobParams> = {
  "jasper.aging": { push: true },
  "jasper.send-invoice": { push: true },
  "jasper.sj": { push: true, days: 7 },
  "jasper.invoice-by-date": { push: false },
  "edi.gr": { push: true },
  "edi.kwitansi": { push: true },
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
    edi: { accounts: [] },
    jobs: {},
    chains: [DEFAULT_CHAIN],
    theme: "system",
    multi: { jobs: ["edi.gr", "edi.kwitansi"], parallel: true },
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
    edi: { accounts: saved.edi?.accounts ?? [] },
    jobs: { ...saved.jobs },
    chains: saved.chains?.length ? saved.chains : d.chains,
    multi: { ...d.multi, ...saved.multi },
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

/**
 * Rentang bawaan Send Invoice: Senin minggu berjalan s/d hari ini (Senin = Senin–Senin, Rabu = Senin–Rabu).
 * Sabtu/Minggu: Senin–Jumat minggu itu. `today` = YYYY-MM-DD (WIB).
 */
export function weekToDate(today: string): { start: string; end: string } {
  const d = new Date(`${today}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Senin … 6 = Minggu
  const shift = (n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  return { start: shift(-dow), end: dow > 4 ? shift(4 - dow) : today };
}

/** Tanggal `iso` digeser `days` hari (kalender). */
export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Tanggal bawaan per job (satu sumber untuk runner & tampilan). `today` = YYYY-MM-DD (WIB).
 * Kwitansi memakai bulan: `start` = tanggal 1 bulan ini.
 */
export function defaultDates(id: JobId, today: string, days = 7): { start: string; end: string } | null {
  switch (id) {
    case "jasper.send-invoice": return weekToDate(today);
    case "jasper.invoice-by-date": return { start: `${today.slice(0, 7)}-01`, end: today };
    case "jasper.sj": return { start: addDays(today, -(Math.min(31, Math.max(1, days)) - 1)), end: today };
    case "edi.gr": return { start: addDays(today, -30), end: today };
    case "edi.kwitansi": return { start: `${today.slice(0, 7)}-01`, end: today };
    default: return null;
  }
}

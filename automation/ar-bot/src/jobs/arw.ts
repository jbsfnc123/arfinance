// Kirim ke database AR Workspace lewat jalur yang SAMA dengan aplikasi web (parser lib/* + RPC upload), login sebagai
// akun sistem "Bot ERP". Juga arsip Google Drive (Web App "ERP Drive Inbox") dan deteksi file kembar.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { detectKind, parseAging, parseErp, type Sheet } from "@/lib/uploads/parse";
import { runUpload } from "@/lib/uploads/run";
import { parseMasterCsv, type ScheduleRow } from "@/lib/modules/tukar/schedule";
import { parseSjCsv, receiptCandidates } from "@/lib/modules/sj/parse";
import { activeSet } from "@/lib/modules/sj/compute";
import { parseGrCsv, parseKwCsv } from "@/lib/modules/m10/parse";
import { todayJakarta } from "@/lib/parsers/date";
import { loadState, setLastPush } from "~/core/store";
import type { JobId } from "~/shared/types";
import type { RunContext } from "~/runner/ctx";

export const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");
export const num = (n: number) => n.toLocaleString("id-ID");
export const rp = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

/** Setara lib/xlsx-client.ts readAllSheets (tanggal tetap serial Excel). */
export function readSheets(buf: Buffer): Sheet[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  return wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "", raw: true }) }));
}

export function inspectAging(sheets: Sheet[]) {
  const kind = detectKind(sheets);
  if (kind !== "aging") throw new Error(`File bukan laporan Aging (terdeteksi: ${kind ?? "tidak dikenal"}).`);
  const a = parseAging(sheets);
  if (!a.rows.length) throw new Error("File Aging kosong (0 baris).");
  return { rows: a.rows.length, total: a.total, month: a.month, sheet: a.sheet };
}

export function inspectErp(sheets: Sheet[]) {
  const kind = detectKind(sheets);
  if (kind !== "erp") throw new Error(`File bukan laporan Invoice and Payment Date Comparison (terdeteksi: ${kind ?? "tidak dikenal"}).`);
  const e = parseErp(sheets);
  if (!e.rows.length) throw new Error("Laporan kosong (0 baris).");
  return e;
}

export function inspectSchedule(text: string, today: string) {
  const { rows, skipped, delimiter } = parseMasterCsv(text);
  const dates = [...new Set(rows.map((r) => r.send_date).filter(Boolean))].sort() as string[];
  return { rows, skipped, delimiter, dates, otherDates: dates.filter((d) => d !== today) };
}

const MAX_SJ_ROWS = 60_000; // batas server per upload
export function inspectSj(text: string) {
  const parsed = parseSjCsv(text);
  if (parsed.rows.length > MAX_SJ_ROWS) throw new Error(`File berisi ${parsed.rows.length} baris; maksimal ${MAX_SJ_ROWS} per upload.`);
  return parsed;
}

/** Klien Supabase yang sudah login sebagai akun sistem "Bot ERP". */
async function botClient(ctx: RunContext) {
  const { supabaseUrl, anonKey, botEmail } = ctx.config.arw;
  if (!supabaseUrl || !anonKey || !botEmail) throw new Error("Koneksi AR Workspace (URL, anon key, email Bot ERP) belum lengkap di Pengaturan.");
  const password = ctx.secret("botPassword", "Password akun Bot ERP");
  const supabase = createClient<Database>(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await supabase.auth.signInWithPassword({ email: botEmail, password });
  if (error) throw new Error(`Login Bot ERP gagal: ${error.message}`);
  return { supabase, done: async () => { await supabase.auth.signOut(); } };
}

/** Uji login akun Bot ERP (Pengaturan › Uji Koneksi). */
export async function testArw(ctx: RunContext) {
  const { supabase, done } = await botClient(ctx);
  try {
    const { data } = await supabase.auth.getUser();
    return `login sebagai ${data.user?.email ?? "?"}`;
  } finally { await done(); }
}

async function withBot<T>(ctx: RunContext, fn: (client: Parameters<typeof runUpload>[0]) => Promise<T>) {
  const { supabase, done } = await botClient(ctx);
  // Paket ini punya salinan supabase-js sendiri; lib/uploads hanya memakai tipenya → cast aman.
  try { return await fn(supabase as unknown as Parameters<typeof runUpload>[0]); } finally { await done(); }
}

export const pushAging = (ctx: RunContext, file: string, sheets: Sheet[], reportDate: string) => withBot(ctx, (c) =>
  runUpload(c, "aging", new File([fs.readFileSync(file)], path.basename(file)), sheets, { month: reportDate.slice(0, 7), reportDate }));

export const pushErp = (ctx: RunContext, file: string, sheets: Sheet[]) => withBot(ctx, (c) =>
  runUpload(c, "erp", new File([fs.readFileSync(file)], path.basename(file)), sheets));

export const pushSchedule = (ctx: RunContext, file: string, rows: ScheduleRow[]) => withBot(ctx, async (c) => {
  const { data, error } = await c.rpc("schedule_replace", { p_rows: rows, p_file_name: path.basename(file) });
  if (error) throw new Error(`schedule_replace: ${error.message}`);
  return Number(data);
});

type SjResult = { sent: number; saved: number; existing: number; notInAging: number; notRecognized: number; badDate: number };
export const pushSj = (ctx: RunContext, file: string, parsed: ReturnType<typeof inspectSj>) => withBot(ctx, async (c) => {
  const { data: receivers, error: e1 } = await c.from("sj_receivers" as never).select("id, name, active");
  if (e1) throw new Error(`daftar Receiver: ${e1.message}`);
  const recognized = activeSet((receivers ?? []) as { id: number; name: string; active: boolean }[]);
  if (!recognized.size) throw new Error("daftar Receiver aktif kosong (cek akses menu Monitor Surat Jalan untuk Bot ERP)");
  const rows = receiptCandidates(parsed, recognized).map(({ sj_key, sj_no, receive_date, receiver }) => ({ sj_key, sj_no, receive_date, receiver }));
  if (!rows.length) return { candidates: 0, result: null as SjResult | null };
  const { data, error } = await c.rpc("sj_receipts_apply" as never, { p_file_name: path.basename(file), p_rows: rows } as never);
  if (error) throw new Error(`sj_receipts_apply: ${error.message}`);
  return { candidates: rows.length, result: data as SjResult };
});

// ── Mitra10 (EDI): sama dengan halaman Mitra10 › Upload (app/(shell)/mitra10/m10-upload.tsx) ──────────────
const GR_CHUNK = 2000;

/** "Upload CSV GR": parseGrCsv → m10_gr_add per 2.000 baris (insert-only; baris yang sudah ada dilewati). */
export function inspectM10Gr(text: string) {
  const r = parseGrCsv(text, Number(todayJakarta().slice(0, 4)));
  if (!r.rows.length) throw new Error("File GR tidak berisi baris data (format CSV GR Report Detail?).");
  return r;
}
export const pushM10Gr = (ctx: RunContext, file: string, parsed: ReturnType<typeof inspectM10Gr>) => withBot(ctx, async (c) => {
  let added = 0;
  for (let i = 0; i < parsed.rows.length; i += GR_CHUNK) {
    const { data, error } = await c.rpc("m10_gr_add", { p_rows: parsed.rows.slice(i, i + GR_CHUNK), p_file_name: path.basename(file), p_first: i === 0 });
    if (error) throw new Error(`m10_gr_add: ${error.message}`);
    added += Number(data ?? 0);
  }
  return added;
});

/** "Import Kwitansi": parseKwCsv → m10_kw_add dengan Username = username akun EDI (Invoice No yang sudah ada dilewati). */
export function inspectM10Kw(text: string) {
  return parseKwCsv(text);
}
export const pushM10Kw = (ctx: RunContext, file: string, parsed: ReturnType<typeof inspectM10Kw>, username: string) => withBot(ctx, async (c) => {
  const { data, error } = await c.rpc("m10_kw_add", { p_rows: parsed.rows, p_username: username, p_file_name: path.basename(file) });
  if (error) throw new Error(`m10_kw_add: ${error.message}`);
  const r = data as { added: number; skipped: number };
  return { added: r.added, skipped: r.skipped + parsed.dupInFile };
});

/**
 * true bila file identik dengan kiriman sukses terakhir (dan tidak dipaksa).
 * `job` = id job, atau id job + akun untuk file per akun (mis. "edi.gr:akun-1").
 */
export function unchanged(ctx: RunContext, job: string, sha: string) {
  const last = loadState().lastPush[job];
  if (ctx.opts.force || last?.sha !== sha) return false;
  ctx.info(`File identik dengan kiriman sukses ${new Date(last.at).toLocaleString("id-ID")} — tidak dikirim ulang.`);
  return true;
}
export const markPushed = (job: string, sha: string) => setLastPush(job, sha);

const MIME: Record<string, string> = {
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".csv": "text/csv",
  ".pdf": "application/pdf",
};

/** Arsip ke Google Drive. Gagal arsip hanya peringatan (update database tetap jalan). */
export async function archive(ctx: RunContext, file: string, month: string) {
  const { enabled, url } = ctx.config.drive;
  const secret = ctx.secrets.driveSecret;
  if (!enabled) return;
  if (!url || !secret) { ctx.warn("Arsip Drive dilewati: URL / rahasia Drive Inbox belum diisi."); return; }
  for (let i = 1; i <= 2; i++) {
    try {
      const d = await driveUpload(file, month, url, secret);
      ctx.info(`Drive: tersimpan di folder ${d.folder}`);
      return;
    } catch (e) {
      if (i === 2) ctx.warn(`Arsip Drive gagal: ${(e as Error).message}`);
    }
  }
}

export async function driveUpload(file: string, month: string, url: string, secret: string) {
  const body = JSON.stringify({
    secret, fileName: path.basename(file), month,
    mimeType: MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    base64: fs.readFileSync(file).toString("base64"),
  });
  // Web App menjawab POST dengan 302 ke googleusercontent; fetch mengikutinya (GET) dan membaca hasil JSON.
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body, redirect: "follow" });
  const text = await res.text();
  let out: { ok?: boolean; error?: string; fileId?: string; url?: string; folder?: string };
  try { out = JSON.parse(text); } catch { throw new Error(`jawaban bukan JSON (HTTP ${res.status}); periksa URL Web App & akses "Anyone".`); }
  if (!out.ok) throw new Error(`Drive menolak: ${out.error ?? "tidak diketahui"}`);
  return { fileId: out.fileId!, url: out.url!, folder: out.folder! };
}

/**
 * Uji Drive tanpa mengunggah: kirim rahasia tanpa file. Web App (gas/Code.gs) menjawab "denied" bila rahasia salah dan
 * "empty" bila rahasia benar tetapi tidak ada file.
 */
export async function testDrive(url: string, secret: string) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret }), redirect: "follow" });
  const text = await res.text();
  let out: { ok?: boolean; error?: string };
  try { out = JSON.parse(text); } catch { throw new Error(`jawaban bukan JSON (HTTP ${res.status}); periksa URL Web App & akses "Anyone"`); }
  if (out.error === "denied") throw new Error("rahasia ditolak");
  if (out.error === "empty" || out.ok) return "terhubung, rahasia diterima";
  throw new Error(out.error ?? "jawaban tidak dikenal");
}

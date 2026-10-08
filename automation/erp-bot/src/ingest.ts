// Baca file Aging & kirim ke database lewat jalur yang SAMA dengan Pusat Upload (lib/uploads/run.ts → uploadShared →
// upload_begin / upload_rows / aging_commit), login sebagai akun sistem "Bot ERP".
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { detectKind, parseAging, type Sheet } from "@/lib/uploads/parse";
import { runUpload } from "@/lib/uploads/run";

/** Setara lib/xlsx-client.ts readAllSheets (tanggal tetap serial Excel). */
export function readSheets(buf: Buffer): Sheet[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  return wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "", raw: true }) }));
}

/** Pastikan file memang Aging & isinya wajar. */
export function inspectAging(sheets: Sheet[]) {
  const kind = detectKind(sheets);
  if (kind !== "aging") throw new Error(`File bukan laporan Aging (terdeteksi: ${kind ?? "tidak dikenal"}).`);
  const a = parseAging(sheets);
  if (!a.rows.length) throw new Error("File Aging kosong (0 baris).");
  return { rows: a.rows.length, total: a.total, month: a.month, sheet: a.sheet };
}

export const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

/** File identik dengan upload sukses terakhir → tidak perlu dikirim ulang. */
export function lastSuccess(stateFile: string): { sha: string; at: string } | null {
  try { return JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch { return null; }
}
export function saveSuccess(stateFile: string, sha: string) {
  fs.writeFileSync(stateFile, JSON.stringify({ sha, at: new Date().toISOString() }));
}

export async function commitAging(filePath: string, sheets: Sheet[], reportDate: string, env: { url: string; anon: string; email: string; password: string }) {
  const supabase = createClient<Database>(env.url, env.anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: authError } = await supabase.auth.signInWithPassword({ email: env.email, password: env.password });
  if (authError) throw new Error(`Login Bot ERP gagal: ${authError.message}`);
  try {
    const buf = fs.readFileSync(filePath);
    const file = new File([buf], path.basename(filePath));
    // Bot punya salinan supabase-js sendiri; lib/uploads hanya memakai tipenya → cast aman.
    const client = supabase as unknown as Parameters<typeof runUpload>[0];
    return await runUpload(client, "aging", file, sheets, { month: reportDate.slice(0, 7), reportDate });
  } finally {
    await supabase.auth.signOut();
  }
}

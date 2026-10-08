// Laporan Serah Terima Surat Jalan → Monitor Surat Jalan. Parser & pemilihan kandidat SAMA dengan halaman Upload
// (lib/modules/sj/parse.ts: parseSjCsv + receiptCandidates), lalu RPC sj_receipts_apply yang insert-only: hanya SJ di
// Aging terbaru yang belum punya Receive Date yang diisi; data lama tidak ditimpa/dihapus.
import path from "node:path";
import { parseSjCsv, receiptCandidates } from "@/lib/modules/sj/parse";
import { activeSet } from "@/lib/modules/sj/compute";
import { botClient } from "./ingest";

const MAX_ROWS = 60_000; // batas server per upload

export function inspectSj(text: string) {
  const parsed = parseSjCsv(text);
  if (parsed.rows.length > MAX_ROWS) throw new Error(`File berisi ${parsed.rows.length} baris; maksimal ${MAX_ROWS} per upload.`);
  return parsed;
}

type SjResult = { sent: number; saved: number; existing: number; notInAging: number; notRecognized: number; badDate: number };

export async function commitSj(filePath: string, parsed: ReturnType<typeof inspectSj>, env: Parameters<typeof botClient>[0]) {
  const { supabase, done } = await botClient(env);
  try {
    // Receiver yang diakui (aktif) — per SJ dipakai baris pertama dengan Receiver diakui & Receive Date valid.
    const { data: receivers, error: e1 } = await supabase.from("sj_receivers" as never).select("id, name, active");
    if (e1) throw new Error(`daftar Receiver: ${e1.message}`);
    const recognized = activeSet((receivers ?? []) as { id: number; name: string; active: boolean }[]);
    if (!recognized.size) throw new Error("daftar Receiver aktif kosong (cek akses menu Monitor Surat Jalan untuk Bot ERP)");
    const rows = receiptCandidates(parsed, recognized).map(({ sj_key, sj_no, receive_date, receiver }) => ({ sj_key, sj_no, receive_date, receiver }));
    if (!rows.length) return { candidates: 0, result: null };
    const { data, error } = await supabase.rpc("sj_receipts_apply" as never, { p_file_name: path.basename(filePath), p_rows: rows } as never);
    if (error) throw new Error(`sj_receipts_apply: ${error.message}`);
    return { candidates: rows.length, result: data as SjResult };
  } finally {
    await done();
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import type { SharedKind } from "./parse";

const CHUNK = 2000;
const COMMIT = { aging: "aging_commit", erp: "erp_commit", bpmaster: "bp_commit" } as const;

export async function sha256(file: File) {
  const buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Upload satu laporan bersama: batch → potongan 2.000 baris → commit (satu transaksi di database).
// Dipakai Pusat Upload dan semua tombol upload modul, supaya jalur simpannya hanya satu.
export async function uploadShared(
  supabase: SupabaseClient<Database>, kind: SharedKind, file: File, rows: unknown[], meta: Record<string, unknown> = {},
  onProgress?: (done: number, total: number) => void,
) {
  const { data: begin, error: e1 } = await supabase.rpc("upload_begin", {
    p_kind: kind, p_file_name: file.name, p_sha256: await sha256(file), p_meta: meta as Json,
  });
  if (e1) throw e1;
  const { batch, seenAt } = begin as { batch: string; seenAt: string | null };
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.rpc("upload_rows", { p_batch: batch, p_offset: i, p_rows: rows.slice(i, i + CHUNK) as Json });
    if (error) throw error;
    onProgress?.(Math.min(i + CHUNK, rows.length), rows.length);
  }
  const { data, error } = await supabase.rpc(COMMIT[kind], { p_batch: batch });
  if (error) throw error;
  return { result: data as Record<string, unknown>, seenAt };
}

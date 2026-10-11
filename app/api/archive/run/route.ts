// Arsipkan satu (dataset, periode) ke Google Drive: ekspor dari Supabase → gabung dengan arsip lama (bila ada) → gzip →
// simpan & verifikasi di Drive → catat di archive_index → (purge) hapus dari Supabase. Super Admin dicek oleh RPC.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { archiveFileName, isArchiveDataset, mergeArchiveRows, type ArchiveEntry, type ArchiveFile } from "@/lib/archive/datasets";
import { drivePut, driveTrash, gunzipJson, gzipJson } from "@/lib/archive/gas";
import { readArchiveFile, storagePut, storageRemove } from "@/lib/archive/store";

export const runtime = "nodejs";
export const maxDuration = 60;

const PAGE = 5000;
type ExportPage = { rows: Record<string, unknown>[]; total: number | null; amount: number | null };
const rpc = async <T,>(supabase: Awaited<ReturnType<typeof createClient>>, fn: string, args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw Object.assign(new Error(error.message), { status: error.code === "42501" ? 403 : 400 });
  return data as T;
};

export async function POST(req: Request) {
  try {
    const body = await req.json() as { dataset?: unknown; period?: unknown; label?: unknown; purge?: unknown };
    if (!isArchiveDataset(body.dataset) || typeof body.period !== "string" || !/^[\w-]{1,20}$/.test(body.period)) {
      return NextResponse.json({ error: "dataset / periode tidak valid" }, { status: 400 });
    }
    const dataset = body.dataset, period = body.period;
    const label = typeof body.label === "string" ? body.label.slice(0, 120) : null;
    const supabase = await createClient();

    // 1. Ekspor per halaman (urut kunci). Total & nominal dari halaman pertama dipakai untuk verifikasi & purge.
    const fresh: Record<string, unknown>[] = [];
    let total = 0, amount = 0;
    for (let offset = 0; ; offset += PAGE) {
      const page = await rpc<ExportPage>(supabase, "archive_export", { p_dataset: dataset, p_period: period, p_offset: offset, p_limit: PAGE });
      if (offset === 0) { total = page.total ?? 0; amount = Number(page.amount ?? 0); }
      fresh.push(...page.rows);
      if (page.rows.length < PAGE) break;
    }
    if (!fresh.length) return NextResponse.json({ error: "Tidak ada data yang bisa diarsip untuk periode ini." }, { status: 409 });
    if (fresh.length !== total) return NextResponse.json({ error: "Data berubah selama ekspor — coba lagi." }, { status: 409 });

    // 2. Arsip lama periode yang sama → gabungkan (arsip ulang tidak kehilangan baris yang sudah dihapus dari Supabase).
    const list = await rpc<ArchiveEntry[]>(supabase, "archive_list", { p_dataset: dataset });
    const prev = list.find((e) => e.period === period) ?? null;
    let rows = fresh;
    let prevFile: { fileId: string; fileName: string } | null = null;
    if (prev) {
      const meta = await rpc<{ fileId: string; fileName: string; sha256: string; dataset: string }>(supabase, "archive_file", { p_id: prev.id });
      const buf = await readArchiveFile(meta); // Storage dulu (cepat), Drive bila salinan tidak ada; sha256 diverifikasi
      rows = mergeArchiveRows(dataset, gunzipJson<ArchiveFile>(buf).rows, fresh);
      prevFile = { fileId: meta.fileId, fileName: meta.fileName };
    }

    // 3. Simpan & verifikasi di Drive (arsip utama), lalu salinan baca di Supabase Storage.
    const file: ArchiveFile = { v: 1, dataset, period, label, exportedAt: new Date().toISOString(), rows };
    const gz = gzipJson(file);
    const name = archiveFileName(period);
    const put = await drivePut([dataset], name, gz);
    await storagePut(dataset, name, gz);

    // 4. Catat; 5. hapus dari Supabase (RPC menolak bila data berubah sejak ekspor).
    const id = await rpc<number>(supabase, "archive_record", {
      p_dataset: dataset, p_period: period, p_label: label, p_file_id: put.fileId, p_file_name: name,
      p_rows: rows.length, p_db_rows: total, p_db_amount: amount, p_bytes: put.size, p_sha256: put.sha256,
    });
    if (prevFile) { // isi lama sudah tergabung di file baru
      await driveTrash(prevFile.fileId).catch(() => {});
      await storageRemove(dataset, prevFile.fileName).catch(() => {});
    }
    let deleted: number | null = null;
    if (body.purge === true) deleted = await rpc<number>(supabase, "archive_purge", { p_id: id });

    return NextResponse.json({ id, dataset, period, rows: rows.length, dbRows: total, amount, bytes: put.size, merged: !!prev, deleted });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}

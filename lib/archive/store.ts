// Salinan baca cepat file arsip di Supabase Storage (bucket privat "archive"). Arsip utama tetap Google Drive (lambat &
// kadang 404 bila dibaca lewat Apps Script), jadi halaman membaca dari sini. Hanya server (service role) yang mengakses;
// hak baca pengguna dicek lebih dulu oleh RPC archive_file.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { driveGet, sha256 } from "./gas";

const BUCKET = "archive";
export const storagePath = (dataset: string, fileName: string) => `${dataset}/${fileName}`;

export async function storagePut(dataset: string, fileName: string, data: Buffer) {
  const { error } = await createAdminClient().storage.from(BUCKET)
    .upload(storagePath(dataset, fileName), data, { contentType: "application/gzip", upsert: true });
  if (error) throw new Error(`Storage: ${error.message}`);
}

export async function storageRemove(dataset: string, fileName: string) {
  await createAdminClient().storage.from(BUCKET).remove([storagePath(dataset, fileName)]);
}

/**
 * Isi file arsip (gzip) terverifikasi sha256: dari Storage; bila belum ada (arsip lama / salinan hilang) ambil dari Drive
 * lalu simpan salinannya untuk bacaan berikutnya.
 */
export async function readArchiveFile(meta: { dataset: string; fileName: string; fileId: string; sha256: string }) {
  const { data } = await createAdminClient().storage.from(BUCKET).download(storagePath(meta.dataset, meta.fileName));
  if (data) {
    const buf = Buffer.from(await data.arrayBuffer());
    if (sha256(buf) === meta.sha256) return buf;
  }
  const buf = await driveGet(meta.fileId);
  if (sha256(buf) !== meta.sha256) throw new Error("Isi arsip di Drive tidak cocok dengan catatan (sha256).");
  await storagePut(meta.dataset, meta.fileName, buf).catch(() => {}); // salinan gagal tidak menggagalkan bacaan
  return buf;
}

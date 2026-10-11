// Klien server-side untuk Web App GAS "AR Archive" (automation/archive-gas). Rahasia & URL hanya di env server.
import "server-only";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

type GasResult = { ok: boolean; error?: string; [k: string]: unknown };

export function archiveConfigured() {
  return !!process.env.ARCHIVE_GAS_URL && !!process.env.ARCHIVE_GAS_SECRET;
}

async function call<T extends GasResult>(action: string, payload: Record<string, unknown>): Promise<T> {
  const url = process.env.ARCHIVE_GAS_URL, secret = process.env.ARCHIVE_GAS_SECRET;
  if (!url || !secret) throw new Error("Arsip Google Drive belum dikonfigurasi (ARCHIVE_GAS_URL / ARCHIVE_GAS_SECRET).");
  // Web App menjawab POST dengan 302 ke googleusercontent (aksi sudah berjalan SEKALI di server). Hasilnya dibaca lewat
  // GET ke alamat itu; Google kadang menjawab 404/HTML palsu pada bacaan acak, jadi bacaan diulang (alamat hasil boleh
  // dibaca berulang). POST TIDAK diulang — aksi seperti `put` tidak boleh terduplikasi.
  const res = await fetch(url, {
    method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "manual", cache: "no-store",
    body: JSON.stringify({ ...payload, secret, action }),
  });
  const loc = res.headers.get("location");
  let text = loc ? "" : await res.text();
  let status = res.status;
  if (loc) {
    for (let i = 0; i < 8; i++) {
      const r = await fetch(loc, { cache: "no-store" });
      status = r.status;
      text = await r.text();
      if (text.trimStart().startsWith("{")) break;
      await new Promise((ok) => setTimeout(ok, 400 * (i + 1)));
    }
  }
  let out: T;
  try { out = JSON.parse(text) as T; } catch { throw new Error(`Drive: jawaban bukan JSON (HTTP ${status}). Periksa deploy Web App AR Archive (akses "Anyone").`); }
  if (!out.ok) throw new Error(`Drive: ${out.error ?? "gagal"}`);
  return out;
}

export const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");
export const gzipJson = (v: unknown) => gzipSync(Buffer.from(JSON.stringify(v), "utf8"), { level: 9 });
export const gunzipJson = <T>(buf: Buffer) => JSON.parse(gunzipSync(buf).toString("utf8")) as T;

/** Simpan file & pastikan isi yang tersimpan di Drive identik (ukuran + sha256 dibaca ulang oleh GAS). */
export async function drivePut(path: string[], name: string, data: Buffer) {
  const out = await call<GasResult & { fileId: string; size: number; sha256: string }>("put", {
    path, name, mimeType: "application/gzip", base64: data.toString("base64"),
  });
  const want = sha256(data);
  if (out.size !== data.length || out.sha256 !== want) {
    await driveTrash(out.fileId).catch(() => {});
    throw new Error("Verifikasi Drive gagal: isi file tersimpan tidak sama dengan yang dikirim.");
  }
  return { fileId: out.fileId, size: out.size, sha256: want };
}

export async function driveGet(fileId: string) {
  const out = await call<GasResult & { base64: string; size: number; name: string }>("get", { fileId });
  if (typeof out.base64 !== "string") throw new Error("Drive: jawaban baca file tidak lengkap — coba lagi.");
  const buf = Buffer.from(out.base64, "base64");
  if (buf.length !== out.size) throw new Error("Drive: ukuran file terbaca tidak cocok — coba lagi.");
  return buf;
}

export const driveTrash = (fileId: string) => call("trash", { fileId });
export const drivePing = () => call<GasResult & { root: string }>("ping", {});
export const drivePrune = (path: string[], keep: number, files = false) => call<GasResult & { trashed: string[] }>("prune", { path, keep, files });

export type DriveFileInfo = { id: string; name: string; size: number; updated: string };
export const driveList = async (path: string[]) => (await call<GasResult & { files: DriveFileInfo[] }>("list", { path })).files;

/** Folder cadangan mingguan tabel master. */
export const BACKUP_PATH = ["_backup"];
export const BACKUP_KEEP = 12;

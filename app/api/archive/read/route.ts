// Baca satu file arsip. Hak baca dicek oleh RPC archive_file (sama dengan hak baca data aslinya). Isi diambil dari
// salinan baca di Supabase Storage (cepat); bila belum ada, dari Google Drive lalu disalin (lib/archive/store.ts).
// File dikirim apa adanya (gzip) dengan Content-Encoding: gzip — browser yang membuka; file arsip tidak pernah berubah
// (versi baru = id baru), jadi boleh di-cache browser selamanya.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readArchiveFile } from "@/lib/archive/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "id tidak valid" }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("archive_file" as never, { p_id: id } as never);
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });
  try {
    const buf = await readArchiveFile(data as unknown as { dataset: string; fileName: string; fileId: string; sha256: string });
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Encoding": "gzip",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

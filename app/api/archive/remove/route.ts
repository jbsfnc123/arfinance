// Hapus arsip Google Drive satu (dataset, periode) — opsi "hapus juga arsip Drive" di Hapus Data Upload (Fase 71).
// Super Admin saja. File Drive dibuang ke Trash, salinan baca di Storage dihapus, catatan archive_index dihapus sehingga
// halaman tidak lagi memuat bulan itu dari arsip.
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { archiveConfigured, driveTrash } from "@/lib/archive/gas";
import { storageRemove } from "@/lib/archive/store";
import { isArchiveDataset } from "@/lib/archive/datasets";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { role } = await getSession();
  if (role.kind !== "sa") return NextResponse.json({ error: "khusus Super Admin" }, { status: 403 });
  const body = await req.json() as { dataset?: unknown; period?: unknown };
  if (!isArchiveDataset(body.dataset) || typeof body.period !== "string" || !/^[\w-]{1,20}$/.test(body.period)) {
    return NextResponse.json({ error: "dataset / periode tidak valid" }, { status: 400 });
  }
  const admin = createAdminClient() as unknown as SupabaseClient; // archive_index belum ada di database.types
  const { data: rows, error } = await admin.from("archive_index").select("id, dataset, file_id, file_name")
    .eq("dataset", body.dataset).eq("period", body.period);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let trashed = 0;
  for (const r of rows ?? []) {
    if (archiveConfigured()) { await driveTrash(r.file_id).then(() => { trashed++; }).catch(() => {}); }
    await storageRemove(r.dataset, r.file_name).catch(() => {});
  }
  if (rows?.length) {
    const { error: e2 } = await admin.from("archive_index").delete().in("id", rows.map((r) => r.id));
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  }
  return NextResponse.json({ removed: rows?.length ?? 0, trashed });
}

// Cadangan mingguan tabel master ke Google Drive (Fase 66): satu file .json.gz berisi semua tabel public kecuali data
// besar yang ditangani arsip (lihat private.backup_table_list). Disimpan 12 cadangan terakhir.
// Dipicu Vercel Cron (Authorization: Bearer CRON_SECRET → service role) atau Super Admin dari halaman Arsip Data.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { BACKUP_KEEP, BACKUP_PATH, drivePrune, drivePut, gzipJson } from "@/lib/archive/gas";

export const runtime = "nodejs";
export const maxDuration = 60;

function cronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const want = Buffer.from(`Bearer ${secret}`), have = Buffer.from(got);
  return want.length === have.length && timingSafeEqual(want, have);
}

async function run(req: Request) {
  let supabase;
  if (cronAuthorized(req)) supabase = createAdminClient();
  else {
    const { role } = await getSession();
    if (role.kind !== "sa") return NextResponse.json({ error: "khusus Super Admin / Vercel Cron" }, { status: 401 });
    supabase = await createClient();
  }
  try {
    const { data: names, error } = await supabase.rpc("backup_tables" as never);
    if (error) throw new Error(error.message);
    const tables: Record<string, unknown[]> = {};
    for (const t of names as unknown as string[]) {
      const r = await supabase.rpc("backup_table" as never, { p_table: t } as never);
      if (r.error) throw new Error(`${t}: ${r.error.message}`);
      tables[t] = r.data as unknown as unknown[];
    }
    const at = new Date();
    const wib = new Date(at.getTime() + 7 * 3600_000).toISOString().replace("T", " ").slice(0, 19).replace(/:/g, "");
    const gz = gzipJson({ v: 1, kind: "backup", at: at.toISOString(), tables });
    const put = await drivePut(BACKUP_PATH, `${wib} WIB.json.gz`, gz);
    const pruned = await drivePrune(BACKUP_PATH, BACKUP_KEEP, true);
    const rows = Object.values(tables).reduce((s, x) => s + x.length, 0);
    return NextResponse.json({ ok: true, tables: Object.keys(tables).length, rows, bytes: put.size, pruned: pruned.trashed.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const GET = run;   // Vercel Cron memakai GET
export const POST = run;  // tombol "Cadangkan sekarang"

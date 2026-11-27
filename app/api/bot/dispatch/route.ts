// Fase 93: picu bot cloud untuk satu baris bot_runs milik pengguna (masih queued). Baris dibuat lewat rpc bot_run_request
// di browser (cek menu Mitra10 + kunci satu run aktif); route ini hanya memegang token GitHub (env server).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dispatchRun, ghConfig } from "@/lib/bot/github";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Sesi berakhir, silakan login ulang." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "id run tidak valid" }, { status: 400 });
  // RLS bot_runs: hanya pengguna menu Mitra10 yang bisa membaca barisnya.
  const { data: row } = await supabase.from("bot_runs" as never).select("id, status, requested_by").eq("id", id).maybeSingle();
  const r = row as { id: number; status: string; requested_by: string } | null;
  if (!r) return NextResponse.json({ error: "Run tidak ditemukan / tanpa akses" }, { status: 404 });
  if (r.requested_by !== userId || r.status !== "queued") return NextResponse.json({ error: "Run ini tidak bisa dipicu" }, { status: 409 });
  const fail = async (msg: string, status: number) => {
    await supabase.rpc("bot_run_dispatch_failed" as never, { p_id: id, p_error: msg } as never);
    return NextResponse.json({ error: msg }, { status });
  };
  const gh = ghConfig();
  if (!gh) return fail("Bot cloud belum dikonfigurasi (ARBOT_GH_TOKEN belum diisi di server).", 503);
  try {
    await dispatchRun(gh, id);
  } catch (e) {
    return fail((e as Error).message, 502);
  }
  return NextResponse.json({ ok: true });
}

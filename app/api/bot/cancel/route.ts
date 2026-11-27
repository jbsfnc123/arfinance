// Fase 93: batalkan run bot cloud (pengguna menu Mitra10). Status di bot_runs langsung "cancelled"; run GitHub (bila sudah
// berjalan) ikut dibatalkan. Runner juga memeriksa status tiap ±15 detik dan berhenti sendiri.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cancelGhRun, ghConfig } from "@/lib/bot/github";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Sesi berakhir, silakan login ulang." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "id run tidak valid" }, { status: 400 });
  const { data, error } = await supabase.rpc("bot_run_cancel" as never, { p_id: id } as never);
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });
  const ghRunId = Number(data);
  const gh = ghConfig();
  if (gh && ghRunId > 0) {
    try { await cancelGhRun(gh, ghRunId); } catch (e) { return NextResponse.json({ ok: true, warning: (e as Error).message }); }
  }
  return NextResponse.json({ ok: true });
}

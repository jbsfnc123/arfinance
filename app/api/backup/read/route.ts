// Unduh satu cadangan mingguan (Super Admin). Hanya file di folder _backup yang boleh dibaca.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { BACKUP_PATH, driveGet, driveList } from "@/lib/archive/gas";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const { role } = await getSession();
  if (role.kind !== "sa") return NextResponse.json({ error: "khusus Super Admin" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  try {
    const f = (await driveList(BACKUP_PATH)).find((x) => x.id === id);
    if (!f) return NextResponse.json({ error: "cadangan tidak ditemukan" }, { status: 404 });
    const buf = await driveGet(f.id);
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Encoding": "gzip", "Cache-Control": "private, max-age=31536000, immutable" },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

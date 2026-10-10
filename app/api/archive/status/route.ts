// Status koneksi arsip Google Drive (kartu Arsip di halaman Database, Super Admin).
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { archiveConfigured, drivePing } from "@/lib/archive/gas";

export const runtime = "nodejs";

export async function GET() {
  const { role } = await getSession();
  if (role.kind !== "sa") return NextResponse.json({ error: "khusus Super Admin" }, { status: 403 });
  if (!archiveConfigured()) return NextResponse.json({ configured: false, ok: false, error: "ARCHIVE_GAS_URL / ARCHIVE_GAS_SECRET belum diisi di server." });
  try {
    const r = await drivePing();
    return NextResponse.json({ configured: true, ok: true, folder: r.root });
  } catch (e) {
    return NextResponse.json({ configured: true, ok: false, error: (e as Error).message });
  }
}

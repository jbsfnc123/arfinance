// Daftar cadangan mingguan di Google Drive (Super Admin).
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { BACKUP_PATH, driveList } from "@/lib/archive/gas";

export const runtime = "nodejs";

export async function GET() {
  const { role } = await getSession();
  if (role.kind !== "sa") return NextResponse.json({ error: "khusus Super Admin" }, { status: 403 });
  try {
    const files = (await driveList(BACKUP_PATH)).sort((a, b) => b.name.localeCompare(a.name));
    return NextResponse.json({ files });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

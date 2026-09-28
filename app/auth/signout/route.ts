import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSharedHost, workspaceFromHost, workspaceUrl } from "@/lib/workspace";

// Keluar dari semua workspace (cookie bersama), lalu kembali ke satu pintu login (tangki.space di produksi).
// Aplikasi Kolektor kembali ke halaman login kolektor sendiri — tidak pernah ke tangki.space.
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const host = request.headers.get("host");
  // Host dari header (bukan request.url, yang bisa berisi alamat server sendiri): tetap di host yang dibuka user.
  const target = isSharedHost(host) && workspaceFromHost(host) !== "kolektor"
    ? workspaceUrl("finance", host, "/login")
    : workspaceUrl(workspaceFromHost(host), host, "/login");
  return NextResponse.redirect(target, { status: 303 });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSharedHost, workspaceUrl } from "@/lib/workspace";

// Keluar dari semua workspace (cookie bersama), lalu kembali ke satu pintu login (tangki.space di produksi).
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const host = request.headers.get("host");
  const target = isSharedHost(host) ? workspaceUrl("finance", host, "/login") : new URL("/login", request.url);
  return NextResponse.redirect(target, { status: 303 });
}

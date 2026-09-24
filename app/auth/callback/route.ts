import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Supabase mengembalikan error di query bila trigger handle_new_user menolak email.
  const errorDescription = searchParams.get("error_description");
  if (errorDescription) {
    const denied = /database error|tidak diizinkan/i.test(errorDescription);
    return NextResponse.redirect(`${origin}/login?error=${denied ? "denied" : "auth"}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Access } from "@/lib/menu";
import type { Tables } from "@/lib/database.types";

export type Session = {
  profile: Tables<"profiles">;
  access: Access;
};

// Satu kali per request: user login, profil, dan daftar submenu yang diizinkan.
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: profile }, { data: acl }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", auth.user.id).single(),
    supabase.from("menu_acl").select("submenu_id").eq("user_id", auth.user.id),
  ]);

  if (!profile || !profile.active) redirect("/login?error=inactive");

  return {
    profile,
    access: { kind: profile.kind, allowed: new Set((acl ?? []).map((r) => r.submenu_id)) },
  };
});

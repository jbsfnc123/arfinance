import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Access } from "@/lib/menu";
import type { Tables } from "@/lib/database.types";

export type Session = {
  profile: Tables<"profiles">;
  role: Pick<Tables<"roles">, "id" | "name" | "kind">;
  access: Access;
};

// Satu kali per request: user login, profil + role, dan submenu yang diizinkan role-nya.
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data } = await supabase
    .from("profiles")
    .select("*, role:roles(id, name, kind)")
    .eq("id", auth.user.id)
    .single();

  if (!data || !data.active || !data.role) {
    await supabase.auth.signOut();
    redirect("/login?error=inactive");
  }

  const { role, ...profile } = data;
  const { data: menus } = await supabase
    .from("role_menus")
    .select("submenu_id")
    .eq("role_id", role.id);

  return {
    profile,
    role,
    access: { kind: role.kind, allowed: new Set((menus ?? []).map((m) => m.submenu_id)) },
  };
});

// Untuk server action & halaman khusus Super Admin.
export async function requireSuperAdmin() {
  const session = await getSession();
  if (session.role.kind !== "sa") throw new Error("Hanya Super Admin yang dapat melakukan ini.");
  return session;
}

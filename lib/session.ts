import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDivision, type Access } from "@/lib/menu";
import type { Tables } from "@/lib/database.types";

export type Session = {
  profile: Tables<"profiles">;
  role: Pick<Tables<"roles">, "id" | "name" | "kind">;
  access: Access;
};

// Satu kali per request (dibagi layout & menuGuard lewat cache()):
//   - identitas dari JWT diverifikasi LOKAL (getClaims, kunci ES256) — tanpa panggilan jaringan ke Auth;
//   - profil + role + submenu role diambil dalam SATU query.
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login");

  const { data } = await supabase
    .from("profiles")
    .select("*, role:roles(id, name, kind, menus:role_menus(submenu_id))")
    .eq("id", userId)
    .single();

  if (!data || !data.active || !data.role) {
    await supabase.auth.signOut();
    redirect("/login?error=inactive");
  }

  const { role: roleRow, ...profile } = data;
  const { menus, ...role } = roleRow as typeof roleRow & { menus: { submenu_id: string }[] | null };
  return {
    profile,
    role,
    access: { kind: role.kind, allowed: new Set((menus ?? []).map((m) => m.submenu_id)), division: isDivision(profile.division) ? profile.division : "ar" },
  };
});

// Untuk server action & halaman khusus Super Admin.
export async function requireSuperAdmin() {
  const session = await getSession();
  if (session.role.kind !== "sa") throw new Error("Hanya Super Admin yang dapat melakukan ini.");
  return session;
}

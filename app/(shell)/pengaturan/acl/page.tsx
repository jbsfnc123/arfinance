import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { MENU_REGISTRY } from "@/lib/menu";
import { NoAccess } from "../no-access";
import { RolesView } from "./roles-view";

export default async function AclPage() {
  const { role: myRole } = await getSession();
  if (myRole.kind !== "sa") return <NoAccess label="Role & Akses Menu" />;

  const supabase = await createClient();
  const [{ data: roles }, { data: menus }, { data: accounts }] = await Promise.all([
    supabase.from("roles").select("id, name, kind").order("name"),
    supabase.from("role_menus").select("role_id, submenu_id"),
    supabase.from("profiles").select("role_id"),
  ]);

  const menusByRole: Record<string, string[]> = {};
  for (const m of menus ?? []) (menusByRole[m.role_id] ??= []).push(m.submenu_id);
  const accountCount: Record<string, number> = {};
  for (const a of accounts ?? []) accountCount[a.role_id] = (accountCount[a.role_id] ?? 0) + 1;

  // Registry dikirim tanpa href eksternal panjang; cukup id, label, needs per grup.
  const groups = MENU_REGISTRY.map((g) => ({
    id: g.id,
    label: g.label,
    items: g.children.map((c) => ({ id: c.id, label: c.label, needs: c.needs ?? null })),
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-medium">Role &amp; Akses Menu</h1>
      <p className="mt-1 text-sm text-fg-2">
        Setiap akun memakai satu role. Centang menu yang boleh dibuka setiap role. Role jenis Super
        Admin otomatis melihat semua menu.
      </p>
      <RolesView
        myRoleId={myRole.id}
        roles={roles ?? []}
        groups={groups}
        menusByRole={menusByRole}
        accountCount={accountCount}
      />
    </div>
  );
}

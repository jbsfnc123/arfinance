import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { aclGroups } from "@/lib/menu";
import { NoAccess } from "@/components/no-access";
import { RolesView } from "./roles-view";

export default async function AclPage() {
  const { role: myRole } = await getSession();
  if (myRole.kind !== "sa") return <NoAccess label="Role & Akses Menu" reason="Menu ini hanya untuk Super Admin." />;

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

  const groups = aclGroups();

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-medium">Role &amp; Akses Menu</h1>
      <p className="mt-1 text-sm text-fg-2">
        Menu yang dicentang di sini adalah <b>default</b> untuk akun baru dengan role tersebut. Mengubahnya tidak
        mengubah akun yang sudah ada — akses menu tiap akun diatur di Akun &amp; PIN. Role jenis Super Admin otomatis
        melihat semua menu.
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

import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { NoAccess } from "@/components/no-access";
import { aclGroups } from "@/lib/menu";
import { AccountsView } from "./accounts-view";

export default async function AkunPage() {
  const { role, profile } = await getSession();
  if (role.kind !== "sa") return <NoAccess label="Akun & PIN" reason="Menu ini hanya untuk Super Admin." />;

  const supabase = await createClient();
  const [{ data: accounts }, { data: roles }, { data: accountMenus }, { data: roleMenus }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, collection_name, active, role_id, division, pin_hash, pin_optional, chatbot_enabled, system_account, created_at")
      .order("display_name"),
    supabase.from("roles").select("id, name, kind").order("name"),
    supabase.from("profile_menus").select("user_id, submenu_id"),
    supabase.from("role_menus").select("role_id, submenu_id"),
  ]);
  const byUser: Record<string, string[]> = {};
  for (const r of accountMenus ?? []) (byUser[r.user_id] ??= []).push(r.submenu_id);
  const byRole: Record<string, string[]> = {};
  for (const r of roleMenus ?? []) (byRole[r.role_id] ??= []).push(r.submenu_id);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-[22px] font-semibold tracking-tight">Akun &amp; PIN</h1>
      <AccountsView
        me={profile.id}
        roles={roles ?? []}
        accounts={(accounts ?? []).map(({ pin_hash, ...a }) => ({ ...a, has_pin: pin_hash !== null }))}
        groups={aclGroups()}
        accountMenus={byUser}
        roleMenus={byRole}
      />
    </div>
  );
}

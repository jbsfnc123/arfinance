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
      <p className="mt-1 text-sm text-fg-2">
        Setiap akun masuk dengan nama &amp; PIN 6 digit. PIN tidak pernah ditampilkan ulang; gunakan &quot;Reset PIN&quot; bila lupa.
        Akun yang belum punya PIN wajib membuat PIN saat pertama kali masuk; setiap akun dapat mengganti PIN dan foto profil sendiri dari menu akun.
        Hanya akun role Kurir yang dapat dicentang &quot;Masuk Aplikasi Kolektor tanpa PIN&quot;.
        Akses menu diatur per akun (tombol &quot;Akses menu&quot;); akun baru otomatis mendapat default menu role-nya.
        Akses chatbot QnA AR Workspace dapat diaktifkan pada formulir Tambah atau Ubah akun; Super Admin selalu memiliki akses.
      </p>
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

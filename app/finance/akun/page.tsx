import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { NoAccess } from "@/components/no-access";
import { AccountsView } from "./accounts-view";

export default async function AkunPage() {
  const { role, profile } = await getSession();
  if (role.kind !== "sa") return <NoAccess label="Akun & PIN" reason="Menu ini hanya untuk Super Admin." />;

  const supabase = await createClient();
  const [{ data: accounts }, { data: roles }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, collection_name, active, role_id, division, pin_hash, created_at")
      .order("display_name"),
    supabase.from("roles").select("id, name, kind").order("name"),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-medium">Akun &amp; PIN</h1>
      <p className="mt-1 text-sm text-fg-2">
        Setiap akun masuk dengan PIN 6 digit yang unik. PIN tidak pernah ditampilkan ulang; gunakan
        &quot;Reset PIN&quot; bila lupa.
      </p>
      <AccountsView
        me={profile.id}
        roles={roles ?? []}
        accounts={(accounts ?? []).map(({ pin_hash, ...a }) => ({ ...a, has_pin: pin_hash !== null }))}
      />
    </div>
  );
}

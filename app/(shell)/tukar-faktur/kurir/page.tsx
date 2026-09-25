import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { KurirApp } from "./kurir-app";

export default async function KurirPage() {
  const { session, allowed, label } = await menuGuard("tukar.detail");
  if (!allowed) return <NoAccess label={label} />;

  const isKurir = session.role.kind === "kurir";
  return <KurirApp ownName={isKurir ? session.profile.display_name : null} />;
}

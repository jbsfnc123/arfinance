import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { KurirApp } from "../(shell)/tukar-faktur/kurir/kurir-app";

// Halaman tunggal Aplikasi Kolektor (komponen yang sama dengan menu AR › Aplikasi Kolektor).
export default async function KolektorPage() {
  const { session, allowed, label } = await menuGuard("tukar.detail");
  if (!allowed) return <NoAccess label={label} />;
  const isKurir = session.role.kind === "kurir";
  return <KurirApp ownName={isKurir ? session.profile.display_name : null} />;
}

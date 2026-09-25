import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { PengajuanList } from "./pengajuan-list";

export default async function PengajuanListPage() {
  const { session, allowed, label } = await menuGuard("inv.batal");
  if (!allowed) return <NoAccess label={label} />;
  return <PengajuanList myName={session.profile.display_name} />;
}

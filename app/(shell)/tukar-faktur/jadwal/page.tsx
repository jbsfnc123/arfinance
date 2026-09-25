import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { JadwalView } from "./jadwal-view";

export default async function JadwalKolektorPage() {
  const { allowed, label } = await menuGuard("tukar.jadwal");
  if (!allowed) return <NoAccess label={label} />;
  return <JadwalView />;
}

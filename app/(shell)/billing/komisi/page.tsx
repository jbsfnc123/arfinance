import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { KomisiView } from "./komisi-view";

export default async function KomisiPage() {
  const { allowed, label } = await menuGuard("bill.komisi");
  if (!allowed) return <NoAccess label={label} />;
  return <KomisiView />;
}

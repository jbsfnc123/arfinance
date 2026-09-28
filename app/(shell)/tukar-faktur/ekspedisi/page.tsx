import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { EkspedisiView } from "./ekspedisi-view";

export default async function EkspedisiPage() {
  const { allowed, label } = await menuGuard("tukar.ekspedisi");
  if (!allowed) return <NoAccess label={label} />;
  return <EkspedisiView />;
}

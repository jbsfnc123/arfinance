import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { RkmView } from "./rkm-view";

export default async function RkmPage() {
  const { allowed, label } = await menuGuard("tukar.rkm");
  if (!allowed) return <NoAccess label={label} />;
  return <RkmView />;
}

import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { HoldView } from "./hold-view";

export default async function HoldPage() {
  const { allowed, label } = await menuGuard("inv.hold");
  if (!allowed) return <NoAccess label={label} />;
  return <HoldView />;
}

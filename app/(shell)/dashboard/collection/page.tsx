import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { DashboardView } from "./dashboard-view";

export default async function DashboardCollectionPage() {
  const { allowed, label } = await menuGuard("dash.coll");
  if (!allowed) return <NoAccess label={label} />;

  return <DashboardView />;
}

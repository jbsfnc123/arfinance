import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { TukarDashboard } from "./tukar-dashboard";

export default async function DashboardTukarPage() {
  const { allowed, label } = await menuGuard("dash.tukar");
  if (!allowed) return <NoAccess label={label} />;
  return <TukarDashboard />;
}

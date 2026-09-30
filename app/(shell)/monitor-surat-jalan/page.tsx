import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { SjView } from "./sj-view";

export default async function MonitorSuratJalanPage() {
  const { allowed, label } = await menuGuard("tukar.monitor_sj");
  if (!allowed) return <NoAccess label={label} />;
  return <SjView />;
}

import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/parsers/date";
import { DashboardView } from "./dashboard-view";

export default async function DashboardCollectionPage() {
  const { allowed, label } = await menuGuard("dash.coll");
  if (!allowed) return <NoAccess label={label} />;

  const supabase = await createClient();
  const { data } = await supabase.from("v_target_months").select("month").order("month", { ascending: false });
  const months = (data ?? []).map((m) => m.month!).filter(Boolean);

  const current = todayJakarta().slice(0, 7);
  const initial = months.includes(current) ? current : months[0] ?? current;

  return <DashboardView months={months} initialMonth={initial} />;
}

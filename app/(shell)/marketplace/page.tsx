import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { createClient } from "@/lib/supabase/server";
import { MarketplaceView, type ReportMeta } from "./marketplace-view";

export default async function MarketplacePage() {
  const { allowed, label } = await menuGuard("rek.marketplace");
  if (!allowed) return <NoAccess label={label} />;

  const supabase = await createClient();
  const { data } = await supabase.from("mp_reports").select("report_id, platform, username, dari, ke").order("dari", { ascending: false });
  return <MarketplaceView initialList={(data ?? []) as ReportMeta[]} />;
}

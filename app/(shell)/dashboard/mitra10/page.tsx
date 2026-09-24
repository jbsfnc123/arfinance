import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { createClient } from "@/lib/supabase/server";
import { Mitra10View } from "./mitra10-view";

export default async function Mitra10DashboardPage() {
  const { allowed, label } = await menuGuard("dash.mitra10");
  if (!allowed) return <NoAccess label={label} />;

  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "mitra10_dashboard").maybeSingle();
  const cfg = (data?.value ?? {}) as { collection?: string; payment_group_prefix?: string };

  return (
    <Mitra10View
      collection={cfg.collection ?? "Yovita Ulfa"}
      prefix={cfg.payment_group_prefix ?? "catur mitra sejati sentosa"}
    />
  );
}

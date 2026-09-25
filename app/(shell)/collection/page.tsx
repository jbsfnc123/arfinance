import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { createClient } from "@/lib/supabase/server";
import type { WaTemplate } from "@/lib/modules/collection/wa-message";
import { CollectionView } from "./collection-view";

export default async function CollectionPage({ searchParams }: PageProps<"/collection">) {
  const { session, allowed, label } = await menuGuard("coll.tagihan");
  if (!allowed) return <NoAccess label={label} />;

  const supabase = await createClient();
  const locked = session.role.kind === "coll";
  const own = session.profile.collection_name;

  if (locked && !own) {
    return <NoAccess label={label} reason="Akun Anda belum punya Collection Name. Hubungi Super Admin." />;
  }

  const { data: settings } = await supabase.from("app_settings").select("key, value").in("key", ["wa_template", "last_tagihan_update"]);
  const { c } = await searchParams;
  const initial = locked ? own! : typeof c === "string" ? c : "";

  const setting = (key: string) => settings?.find((s) => s.key === key)?.value;

  return (
    <CollectionView
      initial={initial}
      locked={locked}
      own={own}
      serverTemplate={(setting("wa_template") as Partial<WaTemplate> | undefined) ?? null}
      lastUpdate={(setting("last_tagihan_update") as string | undefined) ?? null}
    />
  );
}

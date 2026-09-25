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

  const [{ data: summary }, { data: settings }] = await Promise.all([
    supabase.from("v_collection_summary").select("*").order("collection_name"),
    supabase.from("app_settings").select("key, value").in("key", ["wa_template", "last_tagihan_update"]),
  ]);

  const collections = (summary ?? [])
    .filter((s) => s.collection_name && (!locked || s.collection_name === own))
    .map((s) => ({ name: s.collection_name!, invoices: s.invoices ?? 0, total: Number(s.total) || 0 }));
  if (locked && collections.length === 0) collections.push({ name: own!, invoices: 0, total: 0 });

  const { c } = await searchParams;
  const requested = typeof c === "string" ? c : "";
  const initial = locked ? own! : collections.some((x) => x.name === requested) ? requested : "";

  const setting = (key: string) => settings?.find((s) => s.key === key)?.value;

  return (
    <CollectionView
      collections={collections}
      initial={initial}
      locked={locked}
      serverTemplate={(setting("wa_template") as Partial<WaTemplate> | undefined) ?? null}
      lastUpdate={(setting("last_tagihan_update") as string | undefined) ?? null}
    />
  );
}

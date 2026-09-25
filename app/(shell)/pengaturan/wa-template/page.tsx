import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { createClient } from "@/lib/supabase/server";
import type { WaTemplate } from "@/lib/modules/collection/wa-message";
import { WaTemplateForm } from "./wa-template-form";

export default async function WaTemplatePage() {
  const { allowed, label } = await menuGuard("set.watpl");
  if (!allowed) return <NoAccess label={label} />;

  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "wa_template").maybeSingle();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-medium">Template WA</h1>
      <p className="mt-1 text-sm text-fg-2">
        Template bawaan untuk semua collection. Collection tetap bisa mengubah pesan di perangkatnya sendiri lewat
        &quot;Edit Pesan WA&quot;.
      </p>
      <WaTemplateForm initial={(data?.value as Partial<WaTemplate> | undefined) ?? null} />
    </div>
  );
}

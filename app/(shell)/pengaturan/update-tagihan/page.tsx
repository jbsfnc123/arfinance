import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { createClient } from "@/lib/supabase/server";
import { fmtTimestamp } from "@/lib/format";
import { UploadTagihan } from "./upload-tagihan";

export default async function UpdateTagihanPage() {
  const { allowed, label } = await menuGuard("set.update");
  if (!allowed) return <NoAccess label={label} />;

  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "last_tagihan_update").maybeSingle();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-medium">Update Tagihan (Excel)</h1>
      <p className="mt-1 text-sm text-fg-2">
        Data per: {fmtTimestamp(data?.value as string | undefined)}. Upload file <b>Blank_A4</b> untuk mengganti
        seluruh data tagihan.
      </p>
      <UploadTagihan />
    </div>
  );
}

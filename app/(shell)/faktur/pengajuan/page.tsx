import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { PengajuanForm } from "./pengajuan-form";

export default async function PengajuanPage() {
  const { allowed, label } = await menuGuard("inv.pengajuan");
  if (!allowed) return <NoAccess label={label} />;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[22px] font-semibold tracking-tight">Pengajuan Pembatalan &amp; Revisi Faktur Pajak</h1>
      <PengajuanForm />
    </div>
  );
}

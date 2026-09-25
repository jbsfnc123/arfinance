import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { PengajuanForm } from "./pengajuan-form";

export default async function PengajuanPage() {
  const { allowed, label } = await menuGuard("inv.pengajuan");
  if (!allowed) return <NoAccess label={label} />;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-medium">Pengajuan Pembatalan &amp; Revisi Faktur Pajak</h1>
      <p className="mt-1 text-sm text-fg-2">
        Satu pengajuan bisa berisi beberapa invoice. Request, alasan, dan keterangan terbawa ke invoice berikutnya.
      </p>
      <PengajuanForm />
    </div>
  );
}

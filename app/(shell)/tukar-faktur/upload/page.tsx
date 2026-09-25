import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { UploadJadwal } from "./upload-jadwal";

export default async function UploadJadwalPage() {
  const { allowed, label } = await menuGuard("tukar.upload");
  if (!allowed) return <NoAccess label={label} />;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-medium">Upload Jadwal Tukar Faktur</h1>
      <p className="mt-1 text-sm text-fg-2">
        Jadwal kurir diganti seluruhnya. Hasil kunjungan kurir yang sudah tercatat tidak terhapus.
      </p>
      <UploadJadwal />
    </div>
  );
}

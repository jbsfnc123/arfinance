import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { UploadJadwal } from "./upload-jadwal";

export default async function UploadJadwalPage() {
  const { allowed, label } = await menuGuard("tukar.upload");
  if (!allowed) return <NoAccess label={label} />;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[22px] font-semibold tracking-tight">Upload Jadwal Tukar Faktur</h1>
      <UploadJadwal />
    </div>
  );
}

import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { UploadCenter } from "./upload-center";

export default async function UploadPage() {
  const { allowed, label } = await menuGuard("set.update");
  if (!allowed) return <NoAccess label={label} />;
  return <UploadCenter />;
}

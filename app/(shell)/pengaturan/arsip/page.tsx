import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { ArchiveView } from "./archive-view";

export default async function ArchivePage() {
  const { allowed, label } = await menuGuard("set.arsip");
  if (!allowed) return <NoAccess label={label} />;
  return <ArchiveView />;
}

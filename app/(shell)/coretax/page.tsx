import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { CoretaxView } from "./coretax-view";

export default async function CoretaxPage() {
  const { allowed, label } = await menuGuard("rek.coretax");
  if (!allowed) return <NoAccess label={label} />;
  return <CoretaxView />;
}

import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { CaseView } from "./case-view";

// Case Administratif + Case Collection digabung menjadi satu menu (coll.case).
export default async function CasePage() {
  const { allowed, label } = await menuGuard("coll.case");
  if (!allowed) return <NoAccess label={label} />;
  return <CaseView />;
}

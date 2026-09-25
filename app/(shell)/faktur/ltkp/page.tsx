import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { LtkpSearch } from "./ltkp-search";

export default async function LtkpPage() {
  const { allowed, label } = await menuGuard("ext.ltkp");
  if (!allowed) return <NoAccess label={label} />;
  return <LtkpSearch />;
}

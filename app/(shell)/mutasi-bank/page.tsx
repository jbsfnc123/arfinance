import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { MutasiView } from "./mutasi-view";

export default async function MutasiBankPage() {
  const { allowed, label } = await menuGuard("rek.mutasi");
  if (!allowed) return <NoAccess label={label} />;
  return <MutasiView />;
}

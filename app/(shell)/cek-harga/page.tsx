import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { CekHargaView } from "./cek-harga-view";

export default async function CekHargaPage() {
  const { allowed, label } = await menuGuard("rek.cekharga");
  if (!allowed) return <NoAccess label={label} />;
  return <CekHargaView />;
}

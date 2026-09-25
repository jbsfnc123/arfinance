import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { Mitra10View } from "./mitra10-view";

export default async function Mitra10Page() {
  const { allowed, label } = await menuGuard("rek.mitra10");
  if (!allowed) return <NoAccess label={label} />;
  return <Mitra10View />;
}

import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { DeckFrame } from "./deck-frame";

export default async function PresentasiPage() {
  const { allowed, label, session } = await menuGuard("lap.presentasi");
  if (!allowed) return <NoAccess label={label} />;
  return <DeckFrame kind={session.role.kind} />;
}

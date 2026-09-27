import { menuGuard } from "@/lib/guard";
import { canAccess, findMenuById } from "@/lib/menu";
import { NoAccess } from "@/components/no-access";
import { CollectionView } from "./collection-view";

export default async function CollectionPage({ searchParams }: PageProps<"/collection">) {
  const { session, allowed, label } = await menuGuard("coll.tagihan");
  if (!allowed) return <NoAccess label={label} />;

  const locked = session.role.kind === "coll";
  const own = session.profile.collection_name;

  if (locked && !own) {
    return <NoAccess label={label} reason="Akun Anda belum punya Collection Name. Hubungi Super Admin." />;
  }

  const { c } = await searchParams;
  const initial = locked ? own! : typeof c === "string" ? c : "";

  const payhist = findMenuById("coll.payhist");
  const canPayHist = !!payhist && canAccess(payhist.item, session.access);

  return (
    <CollectionView
      canPayHist={canPayHist}
      initial={initial}
      locked={locked}
      own={own}
    />
  );
}

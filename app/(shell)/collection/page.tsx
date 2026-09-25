import { menuGuard } from "@/lib/guard";
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

  return (
    <CollectionView
      initial={initial}
      locked={locked}
      own={own}
    />
  );
}

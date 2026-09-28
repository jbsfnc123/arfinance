import { menuGuard } from "@/lib/guard";
import { canAccess, findMenuById } from "@/lib/menu";
import { NoAccess } from "@/components/no-access";
import { CollectionView } from "./collection-view";

export default async function CollectionPage({ searchParams }: PageProps<"/collection">) {
  const { session, allowed, label } = await menuGuard("coll.tagihan");
  if (!allowed) return <NoAccess label={label} />;

  // Tidak ada batas data antar collection: semua akun ber-menu ini memilih collection mana pun. Collection Name akun
  // (opsional) hanya menjadi collection awal.
  const { c } = await searchParams;
  const initial = typeof c === "string" ? c : "";

  const payhist = findMenuById("coll.payhist");
  const canPayHist = !!payhist && canAccess(payhist.item, session.access);

  return (
    <CollectionView
      canPayHist={canPayHist}
      initial={initial}
      preferred={session.profile.collection_name}
    />
  );
}

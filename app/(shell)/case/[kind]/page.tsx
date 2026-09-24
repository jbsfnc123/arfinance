import { notFound } from "next/navigation";
import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { NoteLog } from "../note-log";

const KINDS: Record<string, { menu: string; kategori: string }> = {
  administratif: { menu: "case.admin", kategori: "Administratif" },
  collection: { menu: "case.coll", kategori: "Case" },
};

export default async function CasePage({ params }: PageProps<"/case/[kind]">) {
  const { kind } = await params;
  const cfg = KINDS[kind];
  if (!cfg) notFound();

  const { allowed, label } = await menuGuard(cfg.menu);
  if (!allowed) return <NoAccess label={label} />;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-medium">Log Catatan {cfg.kategori}</h1>
      <p className="mb-4 mt-1 text-sm text-fg-2">Catatan berkategori {cfg.kategori} dari seluruh Collection.</p>
      <NoteLog kategori={cfg.kategori} />
    </div>
  );
}

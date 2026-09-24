import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { canAccess, findMenuByHref } from "@/lib/menu";

// Placeholder untuk semua menu yang modulnya belum dimigrasi.
// Setiap modul yang selesai di-port mendapat route sendiri, yang otomatis
// menggantikan catch-all ini untuk path tersebut.
export default async function PendingModulePage({ params }: PageProps<"/[...slug]">) {
  const { slug } = await params;
  const found = findMenuByHref("/" + slug.join("/"));
  if (!found) notFound();

  const { access } = await getSession();
  const { group, item } = found;

  if (!canAccess(item, access)) {
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        <span className="material-symbols-outlined !text-5xl text-danger">lock</span>
        <h1 className="mt-3 text-xl font-medium">Tidak ada akses</h1>
        <p className="mt-2 text-sm text-fg-2">
          Menu &quot;{item.label}&quot; belum diberikan untuk akun Anda. Hubungi Super Admin.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <span className="material-symbols-outlined !text-5xl text-accent">{group.icon}</span>
      <h1 className="mt-3 text-xl font-medium">
        {group.label} · {item.label}
      </h1>
      <p className="mt-2 text-sm text-fg-2">
        {item.phase !== undefined
          ? `Modul ini sedang dimigrasi dan akan tersedia pada Fase ${item.phase}.`
          : "Modul ini belum memiliki aplikasi sumber dan belum dijadwalkan."}
      </p>
    </div>
  );
}

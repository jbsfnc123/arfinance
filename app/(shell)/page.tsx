import Link from "next/link";
import { getSession } from "@/lib/session";
import { visibleMenu } from "@/lib/menu";

export default async function HomePage() {
  const { profile, access } = await getSession();
  const menu = visibleMenu(access);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-medium">
        Halo, {profile.display_name?.split(" ")[0] ?? profile.email}
      </h1>
      <p className="mt-1 text-sm text-fg-2">Pilih modul yang ingin dibuka.</p>

      {menu.length === 0 ? (
        <div className="mt-8 rounded-xl border border-line bg-surface p-6 text-sm text-fg-2">
          Akun Anda belum diberi akses menu. Minta Super Admin mengatur akses di Pengaturan → Akses Menu.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {menu.map((group) => (
            <section key={group.id} className="rounded-xl border border-line bg-surface p-4">
              <h2 className="flex items-center gap-2 font-medium">
                <span className="material-symbols-outlined text-accent">{group.icon}</span>
                {group.label}
              </h2>
              <ul className="mt-3 space-y-1">
                {group.children.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      target={item.external ? "_blank" : undefined}
                      className="block rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

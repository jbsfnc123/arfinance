import { canEnterWorkspace, type Access } from "@/lib/menu";
import { WORKSPACES, workspaceUrl, type Workspace } from "@/lib/workspace";
import { Icon } from "@/components/icons";

// Ditampilkan saat akun sudah login (cookie bersama *.tangki.space) tetapi divisinya tidak
// mencakup workspace ini: tawarkan workspace yang boleh dibuka. Aplikasi Kolektor tidak menautkan ke host lain.
export function WorkspaceDenied({ ws, access, host }: { ws: Workspace; access: Access; host: string | null }) {
  const others = ws === "kolektor" ? [] : (Object.keys(WORKSPACES) as Workspace[]).filter((w) => w !== ws && canEnterWorkspace(w, access));
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-center">
        <Icon name="lock" size={48} className="text-danger" />
        <h1 className="mt-3 text-xl font-medium">Tidak ada akses {WORKSPACES[ws].label}</h1>
        <p className="mt-2 text-sm text-fg-2">
          {ws === "kolektor" ? "Akun ini tidak punya akses Aplikasi Kolektor. Hubungi Super Admin." : "Divisi akun Anda tidak mencakup workspace ini. Hubungi Super Admin."}
        </p>
        {others.length > 0 && (
          <div className="mt-4 space-y-2">
            {others.map((w) => (
              <a key={w} href={workspaceUrl(w, host)}
                className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 text-left text-sm hover:bg-surface-2">
                <Icon name={WORKSPACES[w].icon} size={20} className="text-accent" />
                Buka {WORKSPACES[w].label}
              </a>
            ))}
          </div>
        )}
        <form action="/auth/signout" method="post" className="mt-4">
          <button type="submit" className="text-sm text-fg-2 underline hover:text-fg">Keluar</button>
        </form>
      </div>
    </main>
  );
}

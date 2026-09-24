import { getSession } from "@/lib/session";
import { visibleMenu } from "@/lib/menu";
import { Sidebar } from "./sidebar";

const KIND_LABEL: Record<string, string> = {
  sa: "Super Admin",
  ctrl: "Controller",
  coll: "Collection",
  kurir: "Kurir",
  user: "Pengguna",
};

export default async function ShellLayout({ children }: LayoutProps<"/">) {
  const { profile, access } = await getSession();
  const menu = visibleMenu(access);
  const roleLabel = profile.kind === "ctrl" && profile.role ? profile.role : KIND_LABEL[profile.kind];

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-[var(--topbar-h)] shrink-0 items-center gap-3 border-b border-line px-4">
        <span className="material-symbols-outlined !text-[26px] text-accent">account_balance</span>
        <span className="text-lg font-medium">AR Workspace</span>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="text-sm">{profile.display_name ?? profile.email}</div>
            <div className="text-xs text-fg-2">{roleLabel}</div>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              title="Keluar"
              className="flex h-9 w-9 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-fg"
            >
              <span className="material-symbols-outlined">logout</span>
            </button>
          </form>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <Sidebar menu={menu} />
        <main className="min-w-0 flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}

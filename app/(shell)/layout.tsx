import { getSession } from "@/lib/session";
import { visibleMenu } from "@/lib/menu";
import { ToastProvider } from "@/components/toast";
import { Sidebar } from "./sidebar";

export default async function ShellLayout({ children }: LayoutProps<"/">) {
  const { profile, role, access } = await getSession();
  const menu = visibleMenu(access);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-[var(--topbar-h)] shrink-0 items-center gap-3 border-b border-line px-4">
        <span className="material-symbols-outlined !text-[26px] text-accent">account_balance</span>
        <span className="text-lg font-medium">AR Workspace</span>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="text-sm">{profile.display_name}</div>
            <div className="text-xs text-fg-2">
              {role.name}
              {profile.collection_name && ` · ${profile.collection_name}`}
            </div>
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
        <main className="min-w-0 flex-1 overflow-auto p-6">
          <ToastProvider>{children}</ToastProvider>
        </main>
      </div>
    </div>
  );
}

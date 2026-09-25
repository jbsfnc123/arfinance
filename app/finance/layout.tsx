import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { canEnterWorkspace, homeWorkspace } from "@/lib/menu";
import { currentHost } from "@/lib/workspace-server";
import { WORKSPACES, workspaceUrl } from "@/lib/workspace";
import { ToastProvider } from "@/components/toast";
import { FinanceNav } from "./finance-nav";

// Finance Workspace (tangki.space): portal pemilih workspace untuk Super Admin & akun divisi AR + AP.
// Pengaturan pusat (Akun, Role, Database) hanya untuk Super Admin. Akun satu divisi diarahkan ke workspace-nya.
export default async function FinanceLayout({ children }: LayoutProps<"/finance">) {
  const [{ profile, role, access }, host] = await Promise.all([getSession(), currentHost()]);
  if (!canEnterWorkspace("finance", access)) redirect(workspaceUrl(homeWorkspace(access), host));
  const isSa = role.kind === "sa";

  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col">
        <header className="flex h-[var(--topbar-h)] shrink-0 items-center gap-3 px-4">
          <span className="material-symbols-outlined !text-[26px] text-accent">{WORKSPACES.finance.icon}</span>
          <span className="text-lg font-medium">{WORKSPACES.finance.label}</span>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm">{profile.display_name}</div>
              <div className="text-xs text-fg-2">{role.name}</div>
            </div>
            <form action="/auth/signout" method="post">
              <button type="submit" title="Keluar"
                className="flex h-9 w-9 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-fg">
                <span className="material-symbols-outlined">logout</span>
              </button>
            </form>
          </div>
        </header>
        {isSa && <FinanceNav />}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </ToastProvider>
  );
}

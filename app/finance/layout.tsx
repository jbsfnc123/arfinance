import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { canEnterWorkspace, homeWorkspace } from "@/lib/menu";
import { currentHost } from "@/lib/workspace-server";
import { WORKSPACES, workspaceUrl } from "@/lib/workspace";
import { ToastProvider } from "@/components/toast";
import { FinanceNav } from "./finance-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppIcon, Icon } from "@/components/icons";
import { workspaceIcon } from "@/lib/ui/app-icons";

// Finance Workspace (tangki.space): portal pemilih workspace untuk Super Admin & akun divisi AR + AP.
// Pengaturan pusat (Akun, Role, Database) hanya untuk Super Admin. Akun satu divisi diarahkan ke workspace-nya.
export default async function FinanceLayout({ children }: LayoutProps<"/finance">) {
  const [{ profile, role, access }, host] = await Promise.all([getSession(), currentHost()]);
  if (!canEnterWorkspace("finance", access)) redirect(workspaceUrl(homeWorkspace(access), host));
  const isSa = role.kind === "sa";

  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col">
        <header className="glass-soft sticky top-0 z-(--z-topbar) flex h-[var(--topbar-h)] shrink-0 items-center gap-2 border-x-0 border-t-0 px-3 text-[13px]">
          <AppIcon spec={{ ...workspaceIcon("finance"), glyph: WORKSPACES.finance.icon }} size={22} />
          <span className="font-semibold tracking-tight">{WORKSPACES.finance.label}</span>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-[13px]">{profile.display_name}</div>
              <div className="text-[11px] text-fg-2">{role.name}</div>
            </div>
            <ThemeToggle />
            <form action="/auth/signout" method="post">
              <button type="submit" title="Keluar" aria-label="Keluar"
                className="flex h-8 w-8 items-center justify-center rounded-[8px] text-fg-2 hover:bg-fg/8 hover:text-fg">
                <Icon name="logout" size={18} />
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

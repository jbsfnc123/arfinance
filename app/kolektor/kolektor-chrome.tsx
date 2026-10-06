"use client";

import { idbClear } from "@/lib/cache/idb";
import { clearViewState, ensureViewOwner } from "@/lib/ui/view-state";
import { WORKSPACES } from "@/lib/workspace";
import { ToastProvider } from "@/components/toast";
import { AlarmProvider, AlarmMenuButton } from "@/components/alarm/alarm-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppIcon, Icon } from "@/components/icons";
import { workspaceIcon } from "@/lib/ui/app-icons";

// Kerangka ringkas untuk HP: judul, nama akun, keluar. Tanpa sidebar & tanpa tautan ke tangki.space.
export function KolektorChrome({ user, children }: {
  user: { id: string; name: string; role: string };
  children: React.ReactNode;
}) {
  ensureViewOwner(user.id);

  async function signOut(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    await idbClear(); // data tidak tertinggal di HP bersama
    clearViewState();
    form.submit();
  }

  return (
    <AlarmProvider><div className="flex min-h-dvh flex-col">
      <header className="glass-soft sticky top-0 z-(--z-topbar) flex h-14 items-center gap-2.5 border-x-0 border-t-0 px-4">
        <AppIcon spec={{ ...workspaceIcon("kolektor"), glyph: WORKSPACES.kolektor.icon }} size={30} />
        <span className="font-semibold tracking-tight">{WORKSPACES.kolektor.label}</span>
        <div className="ml-auto flex items-center gap-1">
          <span className="max-w-32 truncate text-right text-sm" title={`${user.name} · ${user.role}`}>{user.name}</span>
          <AlarmMenuButton className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs hover:bg-fg/8" />
          <ThemeToggle className="!h-11 !w-11" />
          <form action="/auth/signout" method="post" onSubmit={signOut}>
            <button type="submit" title="Keluar" aria-label="Keluar"
              className="flex h-11 w-11 items-center justify-center rounded-full text-fg-2 hover:bg-fg/8 hover:text-fg">
              <Icon name="logout" size={20} />
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 px-4 py-4">
        <ToastProvider>{children}</ToastProvider>
      </main>
    </div></AlarmProvider>
  );
}

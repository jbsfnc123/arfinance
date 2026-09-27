"use client";

import { idbClear } from "@/lib/cache/idb";
import { clearViewState, ensureViewOwner } from "@/lib/ui/view-state";
import { WORKSPACES } from "@/lib/workspace";
import { ToastProvider } from "@/components/toast";

// Kerangka ringkas untuk HP: judul, nama akun, keluar. Tanpa sidebar & menu lain.
export function KolektorChrome({ user, portalHref, children }: {
  user: { id: string; name: string; role: string };
  portalHref: string | null;
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
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-bg/95 px-4 backdrop-blur">
        <span className="material-symbols-outlined !text-[26px] text-accent">{WORKSPACES.kolektor.icon}</span>
        <span className="font-medium">{WORKSPACES.kolektor.label}</span>
        <div className="ml-auto flex items-center gap-1">
          <span className="max-w-32 truncate text-right text-sm" title={`${user.name} · ${user.role}`}>{user.name}</span>
          {portalHref && (
            <a href={portalHref} title="Pilih workspace" className="flex h-11 w-11 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2">
              <span className="material-symbols-outlined">apps</span>
            </a>
          )}
          <form action="/auth/signout" method="post" onSubmit={signOut}>
            <button type="submit" title="Keluar" aria-label="Keluar"
              className="flex h-11 w-11 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-fg">
              <span className="material-symbols-outlined">logout</span>
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 px-4 py-4">
        <ToastProvider>{children}</ToastProvider>
      </main>
    </div>
  );
}

"use client";

import { useState } from "react";
import type { MenuGroup } from "@/lib/menu";
import { idbClear } from "@/lib/cache/idb";
import { ToastProvider } from "@/components/toast";
import { Sidebar } from "./sidebar";

// Kerangka halaman (topbar + sidebar + konten). Client component karena menyimpan status
// drawer mobile dan membersihkan cache browser saat logout.
export function ShellChrome({ menu, user, children }: {
  menu: MenuGroup[];
  user: { name: string; role: string; collection: string | null };
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  async function signOut(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    await idbClear(); // data tidak tertinggal di browser komputer bersama
    form.submit();
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-[var(--topbar-h)] shrink-0 items-center gap-3 border-b border-line px-4">
        <button type="button" onClick={() => setMobileOpen(true)} title="Menu"
          className="flex h-9 w-9 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 md:hidden">
          <span className="material-symbols-outlined">menu</span>
        </button>
        <span className="material-symbols-outlined !text-[26px] text-accent">account_balance</span>
        <span className="text-lg font-medium">AR Workspace</span>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="text-sm">{user.name}</div>
            <div className="text-xs text-fg-2">
              {user.role}
              {user.collection && ` · ${user.collection}`}
            </div>
          </div>
          <form action="/auth/signout" method="post" onSubmit={signOut}>
            <button type="submit" title="Keluar"
              className="flex h-9 w-9 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-fg">
              <span className="material-symbols-outlined">logout</span>
            </button>
          </form>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <Sidebar menu={menu} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
        <main className="min-w-0 flex-1 overflow-auto p-6">
          <ToastProvider>{children}</ToastProvider>
        </main>
      </div>
    </div>
  );
}

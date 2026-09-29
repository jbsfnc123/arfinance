"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { findMenuByHref, type MenuGroup } from "@/lib/menu";
import { Popover } from "@/components/popover";
import { useTheme, type ThemeMode } from "@/lib/ui/prefs";
import { ControlCenter } from "./control-center";

// Menu bar tipis (glass): kiri = identitas workspace + grup & halaman aktif; kanan = cari, refresh, jam, Control
// Center, profil. Logout memakai form /auth/signout existing (onSubmit dari ShellChrome membersihkan cache).

export function TopBar({ title, icon, menu, portalHref, user, onSearch, onRefresh, refreshing, signOut }: {
  title: string; icon: string; menu: MenuGroup[]; portalHref?: string | null;
  user: { name: string; role: string; collection: string | null };
  onSearch: () => void; onRefresh: () => void; refreshing: boolean;
  signOut: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const pathname = usePathname();
  const found = findMenuByHref(pathname);
  const group = menu.find((g) => g.children.some((c) => c.href === pathname));
  const pageTitle = pathname === "/" ? "Beranda" : found?.item.label ?? "";
  const [panel, setPanel] = useState<"cc" | "me" | null>(null);
  const btn = "flex h-8 w-8 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-fg";
  return (
    <header className="glass sticky top-0 z-40 flex h-[var(--topbar-h)] shrink-0 items-center gap-1 rounded-none border-x-0 border-t-0 px-3 text-sm shadow-none">
      <span className="material-symbols-outlined !text-[22px] text-accent">{icon}</span>
      <span className="ml-1 font-semibold">{title}</span>
      {group && <span className="ml-3 hidden rounded-md px-2 py-0.5 text-fg-2 sm:inline">{group.label}</span>}
      {pageTitle && <span className="hidden rounded-md px-2 py-0.5 font-medium sm:inline">{pageTitle}</span>}

      <div className="ml-auto flex items-center gap-1">
        <button type="button" onClick={onSearch} aria-label="Cari (Ctrl+K)" title="Cari (Ctrl+K)"
          className="hidden h-8 items-center gap-2 rounded-full border border-line bg-surface-2/60 px-3 text-xs text-fg-2 hover:text-fg sm:flex">
          <span className="material-symbols-outlined !text-base">search</span>Cari<kbd className="ml-1 rounded border border-line px-1 text-[10px]">Ctrl K</kbd>
        </button>
        <button type="button" onClick={onSearch} aria-label="Cari" className={`${btn} sm:hidden`}><span className="material-symbols-outlined">search</span></button>
        <button type="button" onClick={onRefresh} disabled={refreshing} aria-label="Refresh data" title="Refresh data" className={btn}>
          <span className={`material-symbols-outlined ${refreshing ? "animate-spin" : ""}`}>refresh</span>
        </button>
        <Clock />
        <span className="relative">
          <button type="button" data-popover-anchor aria-label="Pusat kontrol" title="Pusat kontrol" aria-expanded={panel === "cc"} onClick={() => setPanel(panel === "cc" ? null : "cc")} className={btn}>
            <span className="material-symbols-outlined">tune</span>
          </button>
          <ControlCenter open={panel === "cc"} onClose={() => setPanel(null)} onRefresh={onRefresh} refreshing={refreshing} />
        </span>
        <span className="relative">
          <button type="button" data-popover-anchor aria-label="Akun" aria-expanded={panel === "me"} onClick={() => setPanel(panel === "me" ? null : "me")}
            className="ml-1 flex h-8 items-center gap-2 rounded-full pl-1 pr-2 hover:bg-surface-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-[11px] font-semibold text-accent">{initials(user.name)}</span>
            <span className="hidden max-w-32 truncate text-xs md:inline">{user.name}</span>
          </button>
          <ProfileMenu open={panel === "me"} onClose={() => setPanel(null)} user={user} portalHref={portalHref} signOut={signOut} />
        </span>
      </div>
    </header>
  );
}

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  return (
    <span className="hidden px-2 text-xs text-fg-2 tabular-nums lg:inline" suppressHydrationWarning>
      {now.toLocaleDateString("id-ID", { weekday: "short", day: "2-digit", month: "short" })} · {now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
    </span>
  );
}

const THEMES: { v: ThemeMode; l: string }[] = [{ v: "dark", l: "Gelap" }, { v: "light", l: "Terang" }, { v: "system", l: "Sistem" }];

function ProfileMenu({ open, onClose, user, portalHref, signOut }: {
  open: boolean; onClose: () => void; user: { name: string; role: string; collection: string | null }; portalHref?: string | null;
  signOut: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const [theme, setTheme] = useTheme();
  const item = "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-surface-2";
  return (
    <Popover open={open} onClose={onClose} label="Menu akun" className="right-0 top-full mt-2 w-64 p-1.5">
      <div className="px-3 py-2">
        <div className="text-sm font-medium">{user.name}</div>
        <div className="text-xs text-fg-2">{user.role}{user.collection && ` · ${user.collection}`}</div>
      </div>
      <div className="mx-2 border-t border-line" />
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-fg-2">
        <span className="material-symbols-outlined !text-base">palette</span>Tema
        <span className="ml-auto flex gap-0.5 rounded-lg bg-surface-2/70 p-0.5">
          {THEMES.map((t) => (
            <button key={t.v} type="button" aria-pressed={theme === t.v} onClick={() => setTheme(t.v)}
              className={`rounded-md px-2 py-0.5 ${theme === t.v ? "bg-surface text-fg shadow-sm" : "hover:text-fg"}`}>{t.l}</button>
          ))}
        </span>
      </div>
      {portalHref && <a href={portalHref} className={item}><span className="material-symbols-outlined !text-base">apps</span>Ganti workspace</a>}
      <form action="/auth/signout" method="post" onSubmit={signOut}>
        <button type="submit" className={`${item} text-danger`}><span className="material-symbols-outlined !text-base">logout</span>Keluar</button>
      </form>
    </Popover>
  );
}

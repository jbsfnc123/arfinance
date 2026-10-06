"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { findMenuByHref, type MenuGroup } from "@/lib/menu";
import { AlarmMenuButton } from "@/components/alarm/alarm-provider";
import { Popover } from "@/components/popover";
import { toolbarBtn } from "@/components/ui";
import { useTheme, type ThemeMode } from "@/lib/ui/prefs";
import { ControlCenter } from "./control-center";
import { AppIcon, Icon } from "@/components/icons";
import { workspaceIcon } from "@/lib/ui/app-icons";

// Menu bar tipis (kaca tipis + hairline): kiri = identitas workspace + grup › halaman aktif; kanan = cari, refresh,
// jam, Control Center, profil. Logout memakai form /auth/signout existing (onSubmit dari ShellChrome membersihkan cache).

// Petunjuk pintasan: ⌘K di Mac/iPad, Ctrl K di lainnya. Snapshot server = "Ctrl K" → tanpa hydration mismatch.
const noSub = () => () => {};
const isApple = () => /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
export const useShortcutLabel = () => useSyncExternalStore(noSub, () => (isApple() ? "⌘K" : "Ctrl K"), () => "Ctrl K");

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
  const kbd = useShortcutLabel();
  return (
    <header className="glass-soft sticky top-0 z-(--z-topbar) flex h-[var(--topbar-h)] shrink-0 items-center gap-2 border-x-0 border-t-0 px-3 text-[13px]">
      <AppIcon spec={{ ...workspaceIcon("ar"), glyph: icon }} size={22} />
      <span className="font-semibold tracking-tight">{title}</span>
      {(group || pageTitle) && (
        <nav aria-label="Lokasi" className="ml-2 hidden min-w-0 items-center gap-1 text-fg-2 sm:flex">
          {group && <><span className="truncate">{group.label}</span><Icon name="chevron_right" size={15} className="opacity-60" /></>}
          <span className="truncate font-medium text-fg">{pageTitle}</span>
        </nav>
      )}

      <div className="ml-auto flex items-center gap-0.5">
        <button type="button" onClick={onSearch} aria-label={`Cari (${kbd})`} title={`Cari (${kbd})`} aria-keyshortcuts="Meta+K Control+K"
          className="mr-1 hidden h-7 w-44 items-center gap-1.5 rounded-[8px] border border-hairline bg-fg/5 px-2 text-xs text-fg-2 transition-colors hover:bg-fg/8 hover:text-fg sm:flex">
          <Icon name="search" size={15} />Cari
          <kbd className="ml-auto rounded-[5px] border border-hairline px-1 font-sans text-[10px]">{kbd}</kbd>
        </button>
        <button type="button" onClick={onSearch} aria-label="Cari" className={`${toolbarBtn} sm:hidden`}><Icon name="search" size={18} /></button>
        <button type="button" onClick={onRefresh} disabled={refreshing} aria-label="Refresh data" title="Refresh data" className={toolbarBtn}>
          <Icon name="refresh" size={18} className={refreshing ? "animate-spin" : ""} />
        </button>
        <span className="relative">
          <button type="button" data-popover-anchor aria-label="Pusat kontrol" title="Pusat kontrol" aria-expanded={panel === "cc"}
            onClick={() => setPanel(panel === "cc" ? null : "cc")} className={`${toolbarBtn} ${panel === "cc" ? "!bg-fg/12 !text-fg" : ""}`}>
            <Icon name="toggle_on" size={18} />
          </button>
          <ControlCenter open={panel === "cc"} onClose={() => setPanel(null)} onRefresh={onRefresh} refreshing={refreshing} />
        </span>
        <Clock />
        <span className="relative">
          <button type="button" data-popover-anchor aria-label="Akun" aria-expanded={panel === "me"} onClick={() => setPanel(panel === "me" ? null : "me")}
            className={`${toolbarBtn} ml-0.5 !px-1 ${panel === "me" ? "!bg-fg/12" : ""}`}>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-[10px] font-semibold text-accent">{initials(user.name)}</span>
            <span className="hidden max-w-32 truncate text-xs text-fg md:inline">{user.name}</span>
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
    <span className="hidden px-2 text-xs font-medium tabular-nums text-fg lg:inline" suppressHydrationWarning>
      {now.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" })}
      <span className="ml-2">{now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
    </span>
  );
}

const THEMES: { v: ThemeMode; l: string }[] = [{ v: "dark", l: "Gelap" }, { v: "light", l: "Terang" }, { v: "system", l: "Sistem" }];

function ProfileMenu({ open, onClose, user, portalHref, signOut }: {
  open: boolean; onClose: () => void; user: { name: string; role: string; collection: string | null }; portalHref?: string | null;
  signOut: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const [theme, setTheme] = useTheme();
  const item = "flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-1.5 text-left text-[13px] transition-colors pointer-coarse:min-h-11 hover:bg-accent-fill hover:text-on-accent";
  return (
    <Popover open={open} onClose={onClose} label="Menu akun" className="right-0 top-full mt-1.5 w-64 p-1.5">
      <div className="flex items-center gap-3 px-2.5 py-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent">{initials(user.name)}</span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold">{user.name}</span>
          <span className="block truncate text-[11px] text-fg-2">{user.role}{user.collection && ` · ${user.collection}`}</span>
        </span>
      </div>
      <div className="mx-2 my-1 border-t border-hairline" />
      <div className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-fg-2">
        Tampilan
        <span className="ml-auto flex gap-0.5 rounded-lg bg-fg/6 p-0.5">
          {THEMES.map((t) => (
            <button key={t.v} type="button" aria-pressed={theme === t.v} onClick={() => setTheme(t.v)}
              className={`rounded-md px-2 py-0.5 text-[11px] pointer-coarse:min-h-11 pointer-coarse:px-3 ${theme === t.v ? "bg-surface text-fg shadow-sm" : "hover:text-fg"}`}>{t.l}</button>
          ))}
        </span>
      </div>
      <div className="mx-2 my-1 border-t border-hairline" />
      <AlarmMenuButton className={item} onOpen={onClose} />
      {portalHref && <a href={portalHref} className={item}><Icon name="apps" size={17} />Ganti workspace</a>}
      <form action="/auth/signout" method="post" onSubmit={signOut}>
        <button type="submit" className={item}><Icon name="logout" size={17} />Keluar</button>
      </form>
    </Popover>
  );
}

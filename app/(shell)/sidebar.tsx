"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import type { MenuGroup } from "@/lib/menu";

// Preferensi sidebar per browser (localStorage), dibaca lewat useSyncExternalStore supaya
// aman untuk render server (nilai awal server = default).
const KEY_PIN = "sidebar:pinned";
const KEY_GROUPS = "sidebar:open-groups";
const listeners = new Set<() => void>();
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => {
  try { localStorage.setItem(k, v); } catch { /* opsional */ }
  listeners.forEach((fn) => fn());
};
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const useStored = (k: string) => useSyncExternalStore(subscribe, () => read(k), () => null);

const CLOSE_DELAY = 250;

export function Sidebar({ menu, showHome, mobileOpen, onClose }: { menu: MenuGroup[]; showHome: boolean; mobileOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const pinned = useStored(KEY_PIN) === "1";
  const groupsRaw = useStored(KEY_GROUPS);
  const [hover, setHover] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  let stored: Record<string, boolean> = {};
  try { stored = JSON.parse(groupsRaw ?? "{}"); } catch { /* default */ }
  const activeGroup = menu.find((g) => g.children.some((c) => c.href === pathname))?.id;
  const isOpen = (id: string) => stored[id] ?? id === activeGroup;
  const toggleGroup = (id: string) => write(KEY_GROUPS, JSON.stringify({ ...stored, [id]: !isOpen(id) }));

  const enter = () => { clearTimeout(timer.current); setHover(true); };
  const leave = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setHover(false), CLOSE_DELAY); };
  const expanded = pinned || hover;

  // full = panel lebar (label + dropdown); false = rail ikon. onNavigate = mode drawer mobile.
  const panel = (full: boolean, onNavigate?: () => void) => (
    <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden py-3">
      <div className="mb-2 flex items-center gap-1 px-2">
        {showHome ? (
          <Link href="/" onClick={onNavigate} title="Beranda"
            className={`flex min-w-0 flex-1 items-center gap-3 rounded-full px-3 py-2 text-sm ${pathname === "/" ? "bg-pill text-pill-fg" : "text-fg hover:bg-surface-2"}`}>
            <span className="material-symbols-outlined shrink-0">home</span>
            {full && <span className="truncate">Beranda</span>}
          </Link>
        ) : <div className="flex-1" />}
        {full && !onNavigate && (
          <button type="button" onClick={() => write(KEY_PIN, pinned ? "0" : "1")}
            title={pinned ? "Lepas pin (sidebar sembunyi otomatis)" : "Pin sidebar (selalu terbuka)"}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-surface-2 ${pinned ? "text-accent" : "text-fg-2"}`}>
            <span className="material-symbols-outlined !text-xl" style={{ fontVariationSettings: pinned ? "'FILL' 1" : undefined }}>push_pin</span>
          </button>
        )}
      </div>

      {menu.map((group) => {
        const open = isOpen(group.id);
        const active = group.id === activeGroup;
        if (!full) {
          return (
            <div key={group.id} title={group.label}
              className={`mx-2 mt-1 flex h-10 items-center justify-center rounded-full ${active ? "bg-pill text-pill-fg" : "text-fg-2"}`}>
              <span className="material-symbols-outlined">{group.icon}</span>
            </div>
          );
        }
        return (
          <div key={group.id} className="mt-1">
            <button type="button" onClick={() => toggleGroup(group.id)} aria-expanded={open}
              className={`mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-full px-3 py-2 text-sm ${active ? "font-medium text-accent" : "text-fg"} hover:bg-surface-2`}>
              <span className="material-symbols-outlined shrink-0">{group.icon}</span>
              <span className="flex-1 truncate text-left">{group.label}</span>
              <span className="material-symbols-outlined !text-lg text-fg-2 transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined }}>expand_more</span>
            </button>
            <div className={`grid transition-[grid-template-rows] duration-150 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden">
                {group.children.map((item) => {
                  const cls = `mx-2 flex items-center justify-between rounded-full py-1.5 pl-12 pr-4 text-sm ${
                    pathname === item.href ? "bg-pill text-pill-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg"}`;
                  return item.external ? (
                    <a key={item.id} href={item.href} target="_blank" rel="noreferrer" className={cls} onClick={onNavigate}>
                      <span className="truncate">{item.label}</span>
                      <span className="material-symbols-outlined !text-base text-fg-2">open_in_new</span>
                    </a>
                  ) : (
                    <Link key={item.id} href={item.href} className={cls} onClick={onNavigate}>
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Desktop: rail ikon 56px, melebar saat kursor menyentuh sisi kiri; pin = selalu terbuka. */}
      <div className="relative hidden shrink-0 transition-[width] duration-150 md:block" style={{ width: pinned ? "var(--sidebar-w)" : 56 }}>
        <nav onMouseEnter={enter} onMouseLeave={leave} aria-label="Menu utama"
          className={`absolute inset-y-0 left-0 z-40 border-r border-line bg-bg transition-[width,box-shadow] duration-150 ${expanded && !pinned ? "shadow-2xl shadow-black/50" : ""}`}
          style={{ width: expanded ? "var(--sidebar-w)" : 56 }}>
          {panel(expanded)}
        </nav>
      </div>

      {/* Mobile: drawer dari tombol menu di topbar. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="Tutup menu" className="absolute inset-0 bg-black/50" onClick={onClose} />
          <nav className="absolute inset-y-0 left-0 border-r border-line bg-bg" style={{ width: "var(--sidebar-w)" }} aria-label="Menu utama">
            {panel(true, onClose)}
          </nav>
        </div>
      )}
    </>
  );
}

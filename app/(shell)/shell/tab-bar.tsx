"use client";

import { useEffect, useRef, useState } from "react";
import { findMenuByHref } from "@/lib/menu";
import type { ShellTab } from "@/lib/ui/tabs";
import { AppIcon, Icon } from "@/components/icons";
import { groupIcon, itemIcon } from "@/lib/ui/app-icons";

// Bilah tab seperti browser (Fase 68): setiap menu yang dibuka menjadi tab; klik = pindah tanpa memuat ulang, × / klik
// tengah = tutup, klik kanan = Tutup tab lain / Muat ulang tab ini. Tab terakhir tidak bisa ditutup.

export function tabInfo(path: string) {
  if (path === "/") return { label: "Beranda", icon: groupIcon("home") };
  const found = findMenuByHref(path);
  return found ? { label: found.item.label, icon: itemIcon(found.group.id, found.item.id), group: found.group.label }
    : { label: path, icon: groupIcon("set") };
}

export function TabBar({ tabs, active, onSelect, onClose, onCloseOthers, onReload }: {
  tabs: ShellTab[]; active: string;
  onSelect: (path: string) => void; onClose: (path: string) => void; onCloseOthers: (path: string) => void; onReload: (path: string) => void;
}) {
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const single = tabs.length <= 1;

  // Tab aktif selalu terlihat (bilah bisa digeser bila tab banyak).
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [active, tabs.length]);

  // Menu klik kanan: tutup saat klik di luar / Esc / gulir.
  useEffect(() => {
    if (!menu) return;
    const off = () => setMenu(null);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") off(); };
    addEventListener("mousedown", off); addEventListener("keydown", key); addEventListener("resize", off);
    return () => { removeEventListener("mousedown", off); removeEventListener("keydown", key); removeEventListener("resize", off); };
  }, [menu]);

  return (
    <div className="relative z-[44] flex h-9 shrink-0 items-end border-b border-hairline bg-fg/[0.03] px-2">
      <div ref={strip} role="tablist" aria-label="Tab halaman" className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto [scrollbar-width:none]">
        {tabs.map((t) => {
          const info = tabInfo(t.path);
          const on = t.path === active;
          return (
            <div key={t.path} role="tab" aria-selected={on} tabIndex={on ? 0 : -1} title={info.group ? `${info.group} › ${info.label}` : info.label}
              onClick={() => onSelect(t.path)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(t.path); } }}
              onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); onClose(t.path); } }}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ path: t.path, x: e.clientX, y: e.clientY }); }}
              className={`group flex h-[30px] max-w-[200px] min-w-[96px] shrink-0 cursor-default select-none items-center gap-1.5 rounded-t-[9px] border border-b-0 pl-2 pr-1 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${on ? "border-hairline bg-surface font-medium text-fg shadow-[0_-1px_3px_rgba(0,0,0,.06)]" : "border-transparent text-fg-2 hover:bg-fg/6"}`}>
              <AppIcon spec={info.icon} size={16} />
              <span className="min-w-0 flex-1 truncate">{info.label}</span>
              {!single && (
                <button type="button" aria-label={`Tutup tab ${info.label}`} tabIndex={-1}
                  onClick={(e) => { e.stopPropagation(); onClose(t.path); }}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md hover:bg-fg/10 ${on ? "opacity-80" : "opacity-0 group-hover:opacity-80 pointer-coarse:opacity-60"}`}>
                  <Icon name="close" size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {menu && (
        <div role="menu" aria-label="Menu tab" onMouseDown={(e) => e.stopPropagation()}
          className="glass-strong fixed z-(--z-popover) min-w-44 rounded-xl p-1 text-[13px] shadow-xl"
          style={{ left: Math.min(menu.x, innerWidth - 190), top: menu.y + 4 }}>
          <button type="button" role="menuitem" className="block w-full rounded-lg px-3 py-1.5 text-left hover:bg-fg/8"
            onClick={() => { onReload(menu.path); setMenu(null); }}>Muat ulang tab ini</button>
          <button type="button" role="menuitem" disabled={single} className="block w-full rounded-lg px-3 py-1.5 text-left hover:bg-fg/8 disabled:opacity-40"
            onClick={() => { onCloseOthers(menu.path); setMenu(null); }}>Tutup tab lain</button>
          <button type="button" role="menuitem" disabled={single} className="block w-full rounded-lg px-3 py-1.5 text-left hover:bg-fg/8 disabled:opacity-40"
            onClick={() => { onClose(menu.path); setMenu(null); }}>Tutup tab</button>
        </div>
      )}
    </div>
  );
}

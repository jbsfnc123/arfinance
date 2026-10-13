"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import type { NavGroup } from "@/lib/menu";
import { LockDot, LOCKED_SUFFIX } from "@/components/lock-dot";
import { AppIcon, Icon } from "@/components/icons";
import { useDialog } from "@/components/use-dialog";
import { groupIcon } from "@/lib/ui/app-icons";

// HP (Fase 67): pengganti bar 5 ikon. Default hanya pegangan ^ di tengah bawah (tidak menutupi konten/tombol chat).
// Ketuk atau geser ke atas → lembar kaca naik berisi deretan menu mendatar (Beranda, semua grup, Cari aplikasi).
// Ketuk grup: satu submenu yang bisa dibuka → langsung navigasi; selain itu Semua aplikasi terbuka di grup tersebut.
// Tutup: geser ke bawah, ketuk latar, Esc, atau pindah halaman (status diikat ke path).

const SWIPE = 24; // px gerak vertikal minimum untuk dianggap geser

/** Geser vertikal (pointer events) ke arah `dir` sejauh SWIPE → act(); dipakai pegangan (buka) & kepala lembar (tutup). */
function useSwipe(dir: "up" | "down", act: () => void) {
  const start = useRef<{ id: number; y: number } | null>(null);
  return {
    onPointerDown: (e: React.PointerEvent) => { start.current = { id: e.pointerId, y: e.clientY }; },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      const dy = e.clientY - s.y;
      if (dir === "up" ? dy < -SWIPE : dy > SWIPE) { start.current = null; act(); }
    },
    onPointerUp: () => { start.current = null; },
    onPointerCancel: () => { start.current = null; },
  };
}

export function MobileMenu({ menu, homeLocked, onLauncher, onDenied }: {
  menu: NavGroup[]; homeLocked: boolean; onLauncher: (group?: string) => void; onDenied: (label: string) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const close = useCallback(() => setOpenAt(null), []);
  const sheet = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  useDialog(open, close, sheet, { kind: "overlay", layerRef: layer });

  const swipeOpen = useSwipe("up", () => setOpenAt(pathname));
  const swipeClose = useSwipe("down", close);

  const activeId = pathname === "/" ? "home" : menu.find((g) => g.children.some((c) => pathname === c.href || pathname.startsWith(c.href + "/")))?.id;
  const items = [
    { id: "home", label: "Beranda", locked: homeLocked, go: () => (homeLocked ? onDenied("Beranda") : router.push("/")) },
    ...menu.map((g) => ({
      id: g.id, label: g.label, locked: !!g.locked,
      go: () => {
        if (g.locked) return onDenied(g.label);
        const open = g.children.filter((c) => !c.locked);
        if (g.children.length === 1 && open.length === 1 && !open[0].external) router.push(open[0].href);
        else onLauncher(g.id);
      },
    })),
    { id: "launcher", label: "Cari aplikasi", locked: false, go: () => onLauncher() },
  ];

  return (
    <>
      <button type="button" aria-label="Buka menu" aria-expanded={open} aria-controls={open ? "mobile-menu" : undefined}
        onClick={() => setOpenAt(pathname)} {...swipeOpen}
        className="glass-strong fixed bottom-0 left-1/2 z-(--z-dock) flex h-9 w-20 -translate-x-1/2 touch-none select-none flex-col items-center justify-start rounded-t-[16px] border-b-0 pb-[env(safe-area-inset-bottom)] pt-1 text-fg-2 md:hidden"
        style={{ height: "calc(36px + env(safe-area-inset-bottom, 0px))" }}>
        <Icon name="expand_less" size={22} strokeWidth={2.2} />
      </button>

      {open && (
        <div ref={layer} className="fade-in fixed inset-0 z-(--z-overlay) bg-black/25 backdrop-blur-[2px] md:hidden" onClick={close}>
          <div ref={sheet} id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu" onClick={(e) => e.stopPropagation()}
            className="glass-strong sheet-up absolute inset-x-0 bottom-0 rounded-t-[22px] border-b-0 pb-[max(10px,env(safe-area-inset-bottom))]">
            <div {...swipeClose} className="flex touch-none justify-center pb-1 pt-2">
              <button type="button" aria-label="Tutup menu" onClick={close} className="flex h-6 w-16 items-center justify-center rounded-full">
                <span aria-hidden className="h-1.5 w-10 rounded-full bg-fg/25" />
              </button>
            </div>
            <nav aria-label="Menu utama" className="flex snap-x gap-1 overflow-x-auto px-3 pb-2 pt-1 [scrollbar-width:none]">
              {items.map((it) => (
                <button key={it.id} type="button" onClick={() => { close(); it.go(); }}
                  aria-label={it.locked ? it.label + LOCKED_SUFFIX : it.label} aria-current={activeId === it.id ? "page" : undefined}
                  className={`flex w-[76px] shrink-0 snap-start flex-col items-center gap-1.5 rounded-[14px] px-1 py-2 text-center ${activeId === it.id ? "bg-fg/8" : "active:bg-fg/6"}`}>
                  <span className="relative flex">
                    <AppIcon spec={groupIcon(it.id)} size={46} className="drop-shadow-[0_2px_4px_rgba(0,0,0,.18)]" />
                    {it.locked && <LockDot className="!right-0 !top-0" />}
                  </span>
                  <span className={`line-clamp-2 text-[11px] leading-tight ${activeId === it.id ? "font-semibold text-accent" : "text-fg"}`}>{it.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { MenuGroup } from "@/lib/menu";

// Dock mengambang (navigasi utama, pengganti sidebar). Item = Beranda + grup menu yang boleh diakses + App Launcher.
// Klik grup → menu submenu mengambang di atas Dock (grup dengan satu submenu langsung navigasi).
// Pembesaran saat hover halus (1.28×, tetangga 1.12×) — cukup terasa tanpa mengganggu kerja.

export type DockItem = { id: string; label: string; icon: string; href?: string; group?: MenuGroup };

export function Dock({ menu, showHome, onLauncher }: { menu: MenuGroup[]; showHome: boolean; onLauncher: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  // Menu terbuka diikat ke path → pindah halaman otomatis menutup (tanpa setState di effect).
  const [openAt, setOpenAt] = useState<{ path: string; id: string | null }>({ path: "", id: null });
  const open = openAt.path === pathname ? openAt.id : null;
  const setOpen = (id: string | null) => setOpenAt({ path: pathname, id });
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLElement>(null);

  const items: DockItem[] = [
    ...(showHome ? [{ id: "home", label: "Beranda", icon: "home", href: "/" }] : []),
    ...menu.map((g) => ({ id: g.id, label: g.label, icon: g.icon, group: g })),
  ];
  const activeId = pathname === "/" ? "home" : menu.find((g) => g.children.some((c) => c.href === pathname))?.id;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDown); };
  }, [open]);

  function activate(it: DockItem) {
    if (it.href) { setOpen(null); router.push(it.href); return; }
    const g = it.group!;
    if (g.children.length === 1 && !g.children[0].external) { setOpen(null); router.push(g.children[0].href); return; }
    setOpen(open === it.id ? null : it.id);
  }
  const scale = (i: number) => (hover === null ? 1 : hover === i ? 1.28 : Math.abs(hover - i) === 1 ? 1.12 : 1);
  const openGroup = items.find((it) => it.id === open)?.group ?? null;

  return (
    <nav ref={ref} aria-label="Menu utama" className="fixed inset-x-0 bottom-3 z-40 hidden justify-center px-4 md:flex">
      <div className="relative">
        {openGroup && (
          <div role="menu" aria-label={openGroup.label}
            className="glass pop-in absolute bottom-full left-1/2 mb-3 w-72 -translate-x-1/2 rounded-2xl p-1.5">
            <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-fg-2">
              <span className="material-symbols-outlined !text-base">{openGroup.icon}</span>{openGroup.label}
            </div>
            <div className="mx-2 border-t border-line" />
            {openGroup.children.map((c) => {
              const cls = `flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${pathname === c.href ? "bg-pill text-pill-fg" : "hover:bg-surface-2"}`;
              return c.external ? (
                <a key={c.id} href={c.href} target="_blank" rel="noreferrer" role="menuitem" className={cls} onClick={() => setOpen(null)}>
                  <span className="flex-1 truncate">{c.label}</span><span className="material-symbols-outlined !text-base text-fg-2">open_in_new</span>
                </a>
              ) : (
                <Link key={c.id} href={c.href} role="menuitem" className={cls} onClick={() => setOpen(null)}>
                  <span className="flex-1 truncate">{c.label}</span>
                </Link>
              );
            })}
          </div>
        )}
        <div className="glass flex items-end gap-1 rounded-[22px] px-2 pb-1.5 pt-2" onMouseLeave={() => setHover(null)}>
          {items.map((it, i) => (
            <DockButton key={it.id} label={it.label} icon={it.icon} active={activeId === it.id} pressed={open === it.id}
              scale={scale(i)} onHover={() => setHover(i)} onClick={() => activate(it)} />
          ))}
          <div className="mx-1 h-9 w-px self-center bg-line" />
          <DockButton label="Semua aplikasi" icon="apps" scale={scale(items.length + 1)} onHover={() => setHover(items.length + 1)} onClick={() => { setOpen(null); onLauncher(); }} />
        </div>
      </div>
    </nav>
  );
}

function DockButton({ label, icon, active, pressed, scale, onHover, onClick }: {
  label: string; icon: string; active?: boolean; pressed?: boolean; scale: number; onHover: () => void; onClick: () => void;
}) {
  return (
    <button type="button" aria-label={label} aria-pressed={pressed} title={label} onMouseEnter={onHover} onFocus={onHover} onClick={onClick}
      className="group relative flex h-12 w-12 flex-col items-center justify-end rounded-2xl outline-none transition-transform duration-150 ease-out"
      style={{ transform: `translateY(${(1 - scale) * 12}px) scale(${scale})`, transformOrigin: "bottom center" }}>
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${active || pressed ? "bg-accent/20 text-accent" : "bg-surface-2/70 text-fg group-hover:bg-surface-2"}`}>
        <span className="material-symbols-outlined !text-[22px]">{icon}</span>
      </span>
      <span aria-hidden className={`mt-0.5 h-1 w-1 rounded-full ${active ? "bg-accent" : "bg-transparent"}`} />
      <span role="tooltip" className={`pointer-events-none absolute -top-8 whitespace-nowrap rounded-md bg-surface-elevated px-2 py-0.5 text-xs text-fg opacity-0 shadow-sm transition-opacity ${pressed ? "" : "group-hover:opacity-100 group-focus-visible:opacity-100"}`}>
        {label}
      </span>
    </button>
  );
}

// HP: navigasi bawah ringkas (Beranda + 3 grup pertama + Semua aplikasi).
export function MobileNav({ menu, showHome, onLauncher }: { menu: MenuGroup[]; showHome: boolean; onLauncher: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const items: DockItem[] = [
    ...(showHome ? [{ id: "home", label: "Beranda", icon: "home", href: "/" }] : []),
    ...menu.slice(0, showHome ? 3 : 4).map((g) => ({ id: g.id, label: g.label, icon: g.icon, group: g })),
  ];
  const activeId = pathname === "/" ? "home" : menu.find((g) => g.children.some((c) => c.href === pathname))?.id;
  return (
    <nav aria-label="Menu utama" className="glass fixed inset-x-0 bottom-0 z-40 flex justify-around rounded-t-2xl px-1 pb-[env(safe-area-inset-bottom)] pt-1 md:hidden">
      {[...items, { id: "launcher", label: "Semua", icon: "apps" }].map((it) => (
        <button key={it.id} type="button" aria-label={it.label}
          onClick={() => it.id === "launcher" ? onLauncher() : it.href ? router.push(it.href) : it.group ? (it.group.children.length === 1 ? router.push(it.group.children[0].href) : onLauncher()) : undefined}
          className={`flex min-w-14 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] ${activeId === it.id ? "text-accent" : "text-fg-2"}`}>
          <span className="material-symbols-outlined">{it.icon}</span>{it.label}
        </button>
      ))}
    </nav>
  );
}

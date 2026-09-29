"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MenuGroup } from "@/lib/menu";
import { clampPanelX, dockFitBase, dockSizes } from "./dock-math";
import { AppIcon, Icon } from "@/components/icons";
import { groupIcon, itemIcon } from "@/lib/ui/app-icons";

// Dock mengambang (navigasi utama, pengganti sidebar). Item = Beranda + grup menu yang boleh diakses (ACL existing)
// + Semua aplikasi. Pembesaran mengikuti posisi kursor (kurva cosinus, lib: dock-math.ts): ukuran tombol benar-benar
// bertambah sehingga Dock ikut melebar seperti macOS — tanpa pantulan. Klik grup → submenu mengambang tepat di atas
// ikon (dijepit ke viewport); grup dengan satu submenu langsung navigasi.

export type DockItem = { id: string; label: string; icon: string; href?: string; group?: MenuGroup };

const PANEL_W = 288;
const mq = (q: string) => (fn: () => void) => {
  const m = matchMedia(q); m.addEventListener("change", fn); return () => m.removeEventListener("change", fn);
};
const useMedia = (q: string, server = false) => useSyncExternalStore(mq(q), () => matchMedia(q).matches, () => server);
const onResize = (fn: () => void) => { addEventListener("resize", fn); return () => removeEventListener("resize", fn); };
const useViewportW = () => useSyncExternalStore(onResize, () => innerWidth, () => 1440);

export function Dock({ menu, showHome, onLauncher }: { menu: MenuGroup[]; showHome: boolean; onLauncher: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  // Menu terbuka diikat ke path → pindah halaman otomatis menutup (tanpa setState di effect).
  const [openAt, setOpenAt] = useState<{ path: string; id: string | null; x: number; bottom: number }>({ path: "", id: null, x: 0, bottom: 0 });
  const open = openAt.path === pathname ? openAt.id : null;
  const close = useCallback(() => setOpenAt((o) => ({ ...o, id: null })), []);
  const navRef = useRef<HTMLElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [centers, setCenters] = useState<number[]>([]);
  const [mouseX, setMouseX] = useState<number | null>(null);
  const raf = useRef(0);

  const items: DockItem[] = [
    ...(showHome ? [{ id: "home", label: "Beranda", icon: "home", href: "/" }] : []),
    ...menu.map((g) => ({ id: g.id, label: g.label, icon: g.icon, group: g })),
    { id: "launcher", label: "Semua aplikasi", icon: "apps" },
  ];
  // Ukuran: desktop 44→56, tablet (<1024px) 38→46, dikecilkan otomatis bila jumlah ikon tidak muat di lebar layar;
  // gerak dikurangi → tanpa pembesaran.
  const wide = useMedia("(min-width: 1024px)", true);
  const still = useMedia("(prefers-reduced-motion: reduce)");
  const vw = useViewportW();
  const base = dockFitBase(items.length, vw, wide ? 44 : 38);
  const max = still ? base : Math.round(base * (wide ? 56 / 44 : 46 / 38));
  const activeId = pathname === "/" ? "home" : menu.find((g) => g.children.some((c) => c.href === pathname))?.id;
  const sizes = dockSizes(mouseX, centers.length === items.length ? centers : items.map(() => -1e4), base, max);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onDown = (e: MouseEvent) => { if (navRef.current && !navRef.current.contains(e.target as Node)) close(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDown); };
  }, [open, close]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // Pusat ikon diukur saat Dock masih berukuran dasar (kursor baru masuk) → tidak ada umpan balik ukuran ↔ posisi.
  const onEnter = () => setCenters(btnRefs.current.slice(0, items.length).map((b) => { const r = b?.getBoundingClientRect(); return r ? r.left + r.width / 2 : -1e4; }));
  const onMove = (e: React.MouseEvent) => {
    const x = e.clientX;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => setMouseX(x));
  };
  const onLeave = () => { cancelAnimationFrame(raf.current); setMouseX(null); };

  function activate(it: DockItem, i: number) {
    if (it.id === "launcher") { close(); onLauncher(); return; }
    if (it.href) { close(); router.push(it.href); return; }
    const g = it.group!;
    if (g.children.length === 1 && !g.children[0].external) { close(); router.push(g.children[0].href); return; }
    if (open === it.id) { close(); return; }
    const r = btnRefs.current[i]?.getBoundingClientRect();
    const dock = navRef.current?.querySelector("[data-dock]")?.getBoundingClientRect();
    setOpenAt({ path: pathname, id: it.id, x: r ? r.left + r.width / 2 : innerWidth / 2, bottom: dock ? innerHeight - dock.top + 10 : 90 });
  }
  const openGroup = items.find((it) => it.id === open)?.group ?? null;
  const panelLeft = typeof window === "undefined" ? 0 : clampPanelX(openAt.x, PANEL_W, innerWidth);

  return (
    <nav ref={navRef} aria-label="Menu utama" className="pointer-events-none fixed inset-x-0 bottom-2.5 z-(--z-dock) hidden justify-center px-3 md:flex">
      {openGroup && (
        <div role="menu" aria-label={openGroup.label}
          className="glass pop-in pointer-events-auto fixed rounded-[var(--panel-radius)] p-1.5"
          style={{ left: panelLeft, bottom: openAt.bottom, width: PANEL_W }}>
          <div className="flex items-center gap-2.5 px-2.5 pb-2 pt-1.5">
            <AppIcon spec={groupIcon(openGroup.id)} size={28} />
            <span className="text-[13px] font-semibold">{openGroup.label}</span>
          </div>
          <div className="mx-2 mb-1 border-t border-hairline" />
          {openGroup.children.map((c) => {
            const on = pathname === c.href;
            const cls = `flex items-center gap-2.5 rounded-[10px] px-2 py-[5px] text-[13px] transition-colors ${on ? "bg-accent-fill text-on-accent" : "hover:bg-fg/8"}`;
            const glyph = <Icon name={itemIcon(openGroup.id, c.id).glyph} size={16} className={on ? "" : "text-fg-2"} />;
            return c.external ? (
              <a key={c.id} href={c.href} target="_blank" rel="noreferrer" role="menuitem" className={cls} onClick={close}>
                {glyph}<span className="flex-1 truncate">{c.label}</span><Icon name="open_in_new" size={14} className="opacity-60" />
              </a>
            ) : (
              <Link key={c.id} href={c.href} role="menuitem" aria-current={on ? "page" : undefined} className={cls} onClick={close}>
                {glyph}<span className="flex-1 truncate">{c.label}</span>
              </Link>
            );
          })}
          {/* Panah kecil menunjuk ikon Dock */}
          <span aria-hidden className="absolute -bottom-[7px] h-3.5 w-3.5 rotate-45 border-b border-r border-hairline"
            style={{ left: Math.max(16, Math.min(PANEL_W - 30, openAt.x - panelLeft - 7)), background: "var(--surface-glass)" }} />
        </div>
      )}
      <div data-dock onMouseEnter={onEnter} onMouseMove={onMove} onMouseLeave={onLeave}
        className="glass-strong pointer-events-auto flex items-end gap-1 rounded-[var(--dock-radius)] px-1.5 pb-1 pt-1.5"
        style={{ boxShadow: "var(--shadow-dock), inset 0 1px 0 var(--highlight)" }}>
        {items.map((it, i) => (
          <DockButton key={it.id} ref={(el) => { btnRefs.current[i] = el; }} id={it.id} label={it.label}
            separator={it.id === "launcher"} size={sizes[i] ?? base}
            active={activeId === it.id} pressed={open === it.id} onClick={() => activate(it, i)} />
        ))}
      </div>
    </nav>
  );
}

function DockButton({ ref, id, label, size, active, pressed, separator, onClick }: {
  ref: (el: HTMLButtonElement | null) => void; id: string; label: string; size: number;
  active?: boolean; pressed?: boolean; separator?: boolean; onClick: () => void;
}) {
  return (
    <>
      {separator && <span aria-hidden className="mx-1 mb-2 h-8 w-px self-end bg-hairline" />}
      <button ref={ref} type="button" aria-label={label} aria-pressed={pressed} aria-current={active ? "page" : undefined} onClick={onClick}
        className="group relative flex flex-col items-center justify-end rounded-[14px] outline-none transition-[width,height] duration-100 ease-out"
        style={{ width: size, height: size + 6 }}>
        <AppIcon spec={groupIcon(id)} size={size - 4}
          className="drop-shadow-[0_1px_2px_rgba(0,0,0,.22)] transition-[filter] group-hover:brightness-105 group-active:brightness-90" />
        <span aria-hidden className={`mt-[3px] h-1 w-1 rounded-full ${active ? "bg-fg-2" : "bg-transparent"}`} />
        <span role="tooltip"
          className={`glass pointer-events-none absolute -top-9 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-medium text-fg opacity-0 transition-opacity duration-150 ${pressed ? "" : "group-hover:opacity-100 group-hover:delay-[250ms] group-focus-visible:opacity-100"}`}>
          {label}
        </span>
      </button>
    </>
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
    <nav aria-label="Menu utama" className="glass-strong fixed inset-x-0 bottom-0 z-(--z-dock) flex justify-around rounded-t-[20px] border-b-0 px-1 pb-[env(safe-area-inset-bottom)] pt-1 md:hidden">
      {[...items, { id: "launcher", label: "Semua", icon: "apps" }].map((it) => (
        <button key={it.id} type="button" aria-label={it.label} aria-current={activeId === it.id ? "page" : undefined}
          onClick={() => it.id === "launcher" ? onLauncher() : it.href ? router.push(it.href) : it.group ? (it.group.children.length === 1 ? router.push(it.group.children[0].href) : onLauncher()) : undefined}
          className={`flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[10px] font-medium ${activeId === it.id ? "text-accent" : "text-fg-2"}`}>
          <Icon name={groupIcon(it.id).glyph} size={22} strokeWidth={activeId === it.id ? 2.1 : 1.75} />
          {it.label}
        </button>
      ))}
    </nav>
  );
}

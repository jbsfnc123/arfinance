"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import type { MenuGroup } from "@/lib/menu";
import { AppIcon, Icon } from "@/components/icons";
import { useDialog } from "@/components/use-dialog";
import { itemIcon } from "@/lib/ui/app-icons";

// App Launcher: semua modul yang boleh diakses (menu ACL existing) sebagai grid ubin per grup + pencarian di atas.
// Keyboard: panah menggeser fokus antar-ubin (mengikuti jumlah kolom grid), Enter membuka, Esc menutup.
export function AppLauncher({ open, onClose, menu, showHome }: { open: boolean; onClose: () => void; menu: MenuGroup[]; showHome: boolean }) {
  const [q, setQ] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => { setQ(""); onClose(); }, [onClose]);
  useDialog(open, close, dialogRef, { kind: "overlay", layerRef });
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = [...(showHome ? [{ id: "home", label: "Beranda", icon: "home", children: [{ id: "home", label: "Beranda", href: "/" }] } as MenuGroup] : []), ...menu];
    if (!needle) return all;
    return all.map((g) => ({ ...g, children: g.children.filter((c) => `${g.label} ${c.label}`.toLowerCase().includes(needle)) })).filter((g) => g.children.length);
  }, [menu, showHome, q]);
  if (!open) return null;

  // Navigasi panah: kolom dihitung dari posisi ubin (grid responsif), bukan konstanta.
  const tiles = () => [...(gridRef.current?.querySelectorAll<HTMLElement>("[data-tile]") ?? [])];
  const onGridKey = (e: React.KeyboardEvent) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    const list = tiles();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (i < 0) { list[0]?.focus(); e.preventDefault(); return; }
    const top = list[i].getBoundingClientRect().top;
    const cols = Math.max(1, list.filter((t) => Math.abs(t.getBoundingClientRect().top - top) < 4).length);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "ArrowDown" ? i + cols : i - cols;
    list[Math.max(0, Math.min(list.length - 1, next))]?.focus();
    e.preventDefault();
  };
  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { tiles()[0]?.focus(); e.preventDefault(); }
    if (e.key === "Enter") { tiles()[0]?.click(); e.preventDefault(); }
  };

  return (
    <div ref={layerRef} className="fade-in fixed inset-0 z-(--z-overlay) flex items-start justify-center bg-black/30 p-4 pt-[7vh] backdrop-blur-[3px]" onMouseDown={close}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Semua aplikasi" onMouseDown={(e) => e.stopPropagation()}
        className="glass-strong pop-in relative flex max-h-[82vh] w-full max-w-5xl flex-col rounded-[var(--panel-radius)]">
        <div className="flex items-center gap-2 px-5 pb-3 pt-4">
          <div className="mx-auto flex w-full max-w-md items-center gap-2 rounded-[10px] border border-hairline bg-fg/6 px-3 py-1.5 focus-within:border-accent/60">
            <Icon name="search" size={18} className="text-fg-2" />
            <input data-autofocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} placeholder="Cari aplikasi" aria-label="Cari aplikasi"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-fg-2 no-ring" />
          </div>
          <button type="button" onClick={close} aria-label="Tutup" className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-fg-2 hover:bg-fg/8 hover:text-fg">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div ref={gridRef} onKeyDown={onGridKey} className="min-h-0 overflow-y-auto px-5 pb-5">
          {groups.map((g) => (
            <section key={g.id} className="mb-5 last:mb-0">
              <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-fg-2">{g.label}</h2>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                {g.children.map((c) => {
                  const inner = (
                    <>
                      <AppIcon spec={itemIcon(g.id, c.id)} size={48} className="drop-shadow-[0_2px_4px_rgba(0,0,0,.18)] motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover:-translate-y-0.5" />
                      <span className="line-clamp-2 text-center text-[12px] leading-snug">{c.label}</span>
                      {c.external && <Icon name="open_in_new" size={13} className="absolute right-2 top-2 text-fg-2" />}
                      {q && <span className="text-[10px] text-fg-2">{g.label}</span>}
                    </>
                  );
                  const cls = "group relative flex flex-col items-center gap-2 rounded-[14px] px-2 py-3 outline-none transition-colors hover:bg-fg/6 focus-visible:bg-fg/8";
                  return c.external
                    ? <a key={c.id} data-tile href={c.href} target="_blank" rel="noreferrer" className={cls} onClick={close}>{inner}</a>
                    : <Link key={c.id} data-tile href={c.href} className={cls} onClick={close}>{inner}</Link>;
                })}
              </div>
            </section>
          ))}
          {!groups.length && <p className="py-10 text-center text-[13px] text-fg-2">Tidak ada aplikasi yang cocok.</p>}
        </div>
      </div>
    </div>
  );
}

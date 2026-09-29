"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuGroup } from "@/lib/menu";
import { inputCls } from "@/components/ui";

// App Launcher: semua modul yang boleh diakses dalam grid per grup + pencarian. Esc / klik latar menutup.
export function AppLauncher({ open, onClose, menu, showHome }: { open: boolean; onClose: () => void; menu: MenuGroup[]; showHome: boolean }) {
  const [q, setQ] = useState("");
  const close = useCallback(() => { setQ(""); onClose(); }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = [...(showHome ? [{ id: "home", label: "Beranda", icon: "home", children: [{ id: "home", label: "Beranda", href: "/" }] } as MenuGroup] : []), ...menu];
    if (!needle) return all;
    return all.map((g) => ({ ...g, children: g.children.filter((c) => `${g.label} ${c.label}`.toLowerCase().includes(needle)) })).filter((g) => g.children.length);
  }, [menu, showHome, q]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh] backdrop-blur-sm" onMouseDown={close}>
      <div role="dialog" aria-modal="true" aria-label="Semua aplikasi" onMouseDown={(e) => e.stopPropagation()}
        className="glass pop-in flex max-h-[80vh] w-full max-w-4xl flex-col rounded-3xl p-5">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-fg-2">search</span>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari aplikasi…" aria-label="Cari aplikasi" className={`${inputCls} !bg-transparent !border-0 !px-0 text-base`} />
          <button type="button" onClick={close} aria-label="Tutup" className="rounded-full p-1 text-fg-2 hover:bg-surface-2"><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="mt-4 min-h-0 overflow-y-auto">
          {groups.map((g) => (
            <section key={g.id} className="mb-5">
              <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-2">
                <span className="material-symbols-outlined !text-base">{g.icon}</span>{g.label}
              </h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {g.children.map((c) => {
                  const inner = (
                    <>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent"><span className="material-symbols-outlined">{g.icon}</span></span>
                      <span className="min-w-0 flex-1 text-sm leading-tight">{c.label}</span>
                      {c.external && <span className="material-symbols-outlined !text-base text-fg-2">open_in_new</span>}
                    </>
                  );
                  const cls = "flex items-center gap-3 rounded-2xl p-2.5 hover:bg-surface-2";
                  return c.external
                    ? <a key={c.id} href={c.href} target="_blank" rel="noreferrer" className={cls} onClick={close}>{inner}</a>
                    : <Link key={c.id} href={c.href} className={cls} onClick={close}>{inner}</Link>;
                })}
              </div>
            </section>
          ))}
          {!groups.length && <p className="py-8 text-center text-sm text-fg-2">Tidak ada aplikasi yang cocok.</p>}
        </div>
      </div>
    </div>
  );
}

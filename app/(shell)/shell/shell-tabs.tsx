"use client";

import { Activity, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { closeOthers, closeTab, openTab, sanitizeTabs, type ShellTab } from "@/lib/ui/tabs";
import { useViewState } from "@/lib/ui/view-state";
import { hasTabView, TabView, type TabCtx } from "../tab-views";
import { tabInfo } from "./tab-bar";

// Tab shell (Fase 68). Daftar tab di view-state (sessionStorage: bertahan saat reload, bersih saat logout/ganti akun).
// Halaman yang terdaftar di tab-views dirender shell di dalam <Activity>: tab tersembunyi menyimpan state & DOM-nya
// (filter, isian, scroll, dokumen PDF) sehingga berpindah tab tidak memuat ulang. Halaman lain memakai children.

export function useShellTabs(pathname: string, onEvicted: (label: string) => void) {
  const router = useRouter();
  const [stored, setStored] = useViewState<ShellTab[]>("shell:tabs", []);
  const saved = useMemo(() => sanitizeTabs(stored), [stored]);
  // Path aktif selalu ada di daftar saat render (effect di bawah mencatatnya + waktu pakai).
  const tabs = useMemo(() => (saved.some((t) => t.path === pathname) ? saved : openTab(saved, pathname, null, 0).tabs), [saved, pathname]);
  const prev = useRef<string | null>(null);
  useEffect(() => {
    const from = prev.current;
    prev.current = pathname;
    let evicted: string | null = null;
    setStored((cur) => { const r = openTab(sanitizeTabs(cur), pathname, from, Date.now()); evicted = r.evicted; return r.tabs; });
    if (evicted) onEvicted(tabInfo(evicted).label);
  }, [pathname, setStored, onEvicted]);

  const [reloads, setReloads] = useState<Record<string, number>>({});
  const select = useCallback((path: string) => { if (path !== pathname) router.push(path, { scroll: false }); }, [pathname, router]);
  const close = useCallback((path: string) => {
    const r = closeTab(tabs, path, pathname);
    setStored(r.tabs);
    if (r.go) router.push(r.go, { scroll: false });
  }, [tabs, pathname, setStored, router]);
  const others = useCallback((path: string) => {
    setStored(closeOthers(tabs, path));
    if (path !== pathname) router.push(path, { scroll: false });
  }, [tabs, pathname, setStored, router]);
  const reload = useCallback((path: string) => {
    if (hasTabView(path)) setReloads((r) => ({ ...r, [path]: (r[path] ?? 0) + 1 }));
    else router.refresh();
    if (path !== pathname) router.push(path, { scroll: false });
  }, [pathname, router]);
  return { tabs, reloads, select, close, others, reload };
}

/** Isi <main>: semua tab terdaftar (yang aktif tampil, lainnya disembunyikan & disimpan) + children untuk halaman lain. */
export function TabPages({ tabs, reloads, pathname, ctx, main, children }: {
  tabs: ShellTab[]; reloads: Record<string, number>; pathname: string; ctx: TabCtx; main: RefObject<HTMLElement | null>; children: React.ReactNode;
}) {
  // Posisi scroll <main> per tab: dicatat saat menggulir, dipulihkan saat tab kembali aktif.
  const scroll = useRef(new Map<string, number>());
  const current = useRef(pathname);
  useEffect(() => {
    const el = main.current;
    if (!el) return;
    const onScroll = () => { scroll.current.set(current.current, el.scrollTop); };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [main]);
  useLayoutEffect(() => {
    current.current = pathname;
    const el = main.current;
    if (!el) return;
    const top = scroll.current.get(pathname) ?? 0;
    el.scrollTo({ top });
    const id = requestAnimationFrame(() => { if (el.scrollTop !== top) el.scrollTo({ top }); }); // setelah tata letak tab selesai
    return () => cancelAnimationFrame(id);
  }, [pathname, main]);

  const live = hasTabView(pathname);
  return (
    <>
      {tabs.filter((t) => hasTabView(t.path)).map((t) => (
        <Activity key={`${t.path}#${reloads[t.path] ?? 0}`} mode={t.path === pathname ? "visible" : "hidden"}>
          <div className="page-in" data-tab={t.path}><TabView path={t.path} ctx={ctx} /></div>
        </Activity>
      ))}
      {!live && <div key={pathname} className="page-in">{children}</div>}
    </>
  );
}

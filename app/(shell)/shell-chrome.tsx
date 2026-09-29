"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { MenuGroup } from "@/lib/menu";
import { idbClear } from "@/lib/cache/idb";
import { reloadLoaded } from "@/lib/local/store";
import { clearViewState, ensureViewOwner } from "@/lib/ui/view-state";
import { ToastProvider } from "@/components/toast";
import { TopBar } from "./shell/top-bar";
import { Dock, MobileNav } from "./shell/dock";
import { AppLauncher } from "./shell/app-launcher";
import { Spotlight } from "./shell/spotlight";

// Kerangka halaman AR Workspace (Fase 39, macOS-inspired): Top bar kaca + Dock mengambang (desktop) / bottom nav
// (HP) + App Launcher + Spotlight (Ctrl/Cmd+K). Konten memakai hampir seluruh lebar; ruang bawah dicadangkan
// (--dock-reserve) agar tabel yang tingginya mengikuti layar tidak tertutup Dock. Client component karena menyimpan
// status overlay dan membersihkan cache browser saat logout. Props & pemanggil (layout.tsx) tidak berubah.
export function ShellChrome({ title, icon, portalHref, menu, showHome, user, children }: {
  title: string;
  portalHref?: string | null; // akun SA / divisi AR + AP: kembali ke pemilih workspace (tangki.space)
  icon: string;
  menu: MenuGroup[];
  showHome: boolean;
  user: { id: string; name: string; role: string; collection: string | null };
  children: React.ReactNode;
}) {
  // Overlay diikat ke path saat dibuka → pindah halaman otomatis menutupnya tanpa setState di effect.
  const [ov, setOv] = useState<{ path: string; v: "launcher" | "spotlight" | null }>({ path: "", v: null });
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const overlay = ov.path === pathname ? ov.v : null;
  const setOverlay = useCallback((v: "launcher" | "spotlight" | null | ((o: "launcher" | "spotlight" | null) => "launcher" | "spotlight" | null)) =>
    setOv((prev) => ({ path: pathname, v: typeof v === "function" ? v(prev.path === pathname ? prev.v : null) : v })), [pathname]);
  // State tampilan (filter/cari/scroll) milik akun ini; akun lain di tab yang sama → dibersihkan dulu.
  ensureViewOwner(user.id);
  const canTagihan = menu.some((g) => g.children.some((c) => c.id === "coll.tagihan"));

  // Prefetch semua menu yang boleh diakses saat browser sedang senggang, supaya klik menu tidak menunggu server.
  useEffect(() => {
    const hrefs = menu.flatMap((g) => g.children.filter((c) => !c.external).map((c) => c.href));
    if (showHome) hrefs.unshift("/");
    const run = () => hrefs.forEach((h) => router.prefetch(h));
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(run, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(run, 1200);
    return () => clearTimeout(t);
  }, [menu, showHome, router]);

  // Ctrl/Cmd+K → Spotlight.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOverlay((o) => (o === "spotlight" ? null : "spotlight")); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOverlay]);

  const closeOverlay = useCallback(() => setOverlay(null), [setOverlay]);
  // Refresh: muat ulang dataset yang sedang dipakai + render ulang komponen server.
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await reloadLoaded(); router.refresh(); } finally { setTimeout(() => setRefreshing(false), 400); }
  }, [router]);

  async function signOut(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    await idbClear(); // data tidak tertinggal di browser komputer bersama
    clearViewState();
    form.submit();
  }

  return (
    <div className="flex h-screen flex-col">
      <TopBar title={title} icon={icon} menu={menu} portalHref={portalHref} user={user}
        onSearch={() => setOverlay("spotlight")} onRefresh={refresh} refreshing={refreshing} signOut={signOut} />
      <main className="min-w-0 flex-1 overflow-auto px-4 pt-4 md:px-6 md:pt-5" style={{ paddingBottom: "var(--dock-reserve)" }}>
        <ToastProvider>
          <div key={pathname} className="page-in">{children}</div>
        </ToastProvider>
      </main>
      <Dock menu={menu} showHome={showHome} onLauncher={() => setOverlay("launcher")} />
      <MobileNav menu={menu} showHome={showHome} onLauncher={() => setOverlay("launcher")} />
      <AppLauncher open={overlay === "launcher"} onClose={closeOverlay} menu={menu} showHome={showHome} />
      <Spotlight open={overlay === "spotlight"} onClose={closeOverlay} menu={menu} showHome={showHome} canTagihan={canTagihan} />
    </div>
  );
}

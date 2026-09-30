"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { NavGroup } from "@/lib/menu";
import { idbClear } from "@/lib/cache/idb";
import { reloadLoaded } from "@/lib/local/store";
import { clearViewState, ensureViewOwner } from "@/lib/ui/view-state";
import { ToastProvider, useToast } from "@/components/toast";
import { deniedMessage } from "@/components/lock-dot";
import { TopBar } from "./shell/top-bar";
import { Dock, MobileNav } from "./shell/dock";
import { AppLauncher } from "./shell/app-launcher";
import { Spotlight } from "./shell/spotlight";
import { useCommandK } from "./shell/use-command-k";

// Kerangka halaman AR Workspace (Fase 39, macOS-inspired): Top bar kaca + Dock mengambang (desktop) / bottom nav
// (HP) + App Launcher + Spotlight (Ctrl/Cmd+K). Konten memakai hampir seluruh lebar; ruang bawah dicadangkan
// (--dock-reserve) agar tabel yang tingginya mengikuti layar tidak tertutup Dock. Client component karena menyimpan
// status overlay dan membersihkan cache browser saat logout. Props & pemanggil (layout.tsx) tidak berubah.
type ShellProps = {
  title: string;
  portalHref?: string | null; // akun SA / divisi AR + AP: kembali ke pemilih workspace (tangki.space)
  icon: string;
  menu: NavGroup[];           // SEMUA menu; `locked` = tanpa akses (titik merah, klik → pesan)
  homeLocked: boolean;
  user: { id: string; name: string; role: string; collection: string | null };
  children: React.ReactNode;
};

// ToastProvider membungkus seluruh shell agar Dock/Launcher/Spotlight bisa menampilkan pesan "tidak memiliki akses".
export function ShellChrome(props: ShellProps) {
  return <ToastProvider><ShellFrame {...props} /></ToastProvider>;
}

function ShellFrame({ title, icon, portalHref, menu, homeLocked, user, children }: ShellProps) {
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
  const canTagihan = menu.some((g) => g.children.some((c) => c.id === "coll.tagihan" && !c.locked));
  const toast = useToast();
  // Menu tanpa akses: tetap di halaman sekarang, tampilkan pesan.
  const denyAccess = useCallback((label: string) => toast(deniedMessage(label), "danger", 6000), [toast]);

  // Prefetch semua menu yang boleh diakses saat browser sedang senggang, supaya klik menu tidak menunggu server.
  useEffect(() => {
    const hrefs = menu.flatMap((g) => g.children.filter((c) => !c.external && !c.locked).map((c) => c.href));
    if (!homeLocked) hrefs.unshift("/");
    const run = () => hrefs.forEach((h) => router.prefetch(h));
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(run, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(run, 1200);
    return () => clearTimeout(t);
  }, [menu, homeLocked, router]);

  // Ctrl/Cmd+K → Spotlight (diabaikan selama dialog form/data halaman masih terbuka, lihat use-command-k.ts).
  const toggleSpotlight = useCallback(() => setOverlay((o) => (o === "spotlight" ? null : "spotlight")), [setOverlay]);
  useCommandK(toggleSpotlight);

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
        <div key={pathname} className="page-in">{children}</div>
      </main>
      <Dock menu={menu} homeLocked={homeLocked} onLauncher={() => setOverlay("launcher")} onDenied={denyAccess} />
      <MobileNav menu={menu} homeLocked={homeLocked} onLauncher={() => setOverlay("launcher")} onDenied={denyAccess} />
      <AppLauncher open={overlay === "launcher"} onClose={closeOverlay} menu={menu} homeLocked={homeLocked} onDenied={denyAccess} />
      <Spotlight open={overlay === "spotlight"} onClose={closeOverlay} menu={menu} homeLocked={homeLocked} canTagihan={canTagihan} onDenied={denyAccess} />
    </div>
  );
}

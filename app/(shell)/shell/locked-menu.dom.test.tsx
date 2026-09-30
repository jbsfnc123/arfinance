// @vitest-environment happy-dom
// Menu tanpa akses: semua ikon tampil, yang terkunci bertitik merah & berlabel "tidak ada akses"; klik → onDenied,
// tanpa navigasi. Komponen asli (Dock, AppLauncher, Spotlight) dengan navMenu dari lib/menu.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MENU_REGISTRY, navMenu } from "@/lib/menu";
import { Dock } from "./dock";
import { AppLauncher } from "./app-launcher";
import { Spotlight } from "./spotlight";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch: vi.fn() }), usePathname: () => "/collection" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("@/lib/local/store", () => ({ useLoadedDataset: () => ({ data: null, loading: false }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = ((q: string) => ({ matches: q.includes("min-width"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

// Akun Collection: hanya Daftar Tagihan & PDF Editor; Beranda tidak dicentang.
const access = { kind: "coll", allowed: new Set(["coll.tagihan", "tool.pdf"]) };
const menu = navMenu(access);
const total = MENU_REGISTRY.reduce((n, g) => n + g.children.length, 0);

let host: HTMLDivElement, root: Root;
beforeEach(() => { push.mockClear(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const q = (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)];
const click = (el: HTMLElement) => act(() => { el.click(); });

describe("menu tanpa akses", () => {
  it("Launcher: semua ubin tampil, yang terkunci bertitik merah; klik → pesan, tanpa navigasi", () => {
    const onDenied = vi.fn(), onClose = vi.fn();
    act(() => root.render(<AppLauncher open onClose={onClose} menu={menu} homeLocked onDenied={onDenied} />));
    const tiles = q("[data-tile]");
    expect(tiles.length).toBe(total + 1); // + Beranda
    const locked = tiles.filter((t) => t.getAttribute("aria-label")?.endsWith("tidak ada akses"));
    expect(locked.length).toBe(total + 1 - 2);
    expect(locked.every((t) => t.querySelector(".bg-danger"))).toBe(true);
    expect(tiles.filter((t) => t.querySelector(".bg-danger")).length).toBe(locked.length);
    click(locked.find((t) => t.textContent?.includes("Pusat Upload Data"))!);
    expect(onDenied).toHaveBeenCalledWith("Pengaturan › Pusat Upload Data");
    expect(push).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    const ok = tiles.find((t) => t.textContent?.includes("Daftar Tagihan"))!;
    expect(ok.tagName).toBe("A");
    expect(ok.getAttribute("href")).toBe("/collection");
  });

  it("Dock: grup & Beranda terkunci → pesan; grup campuran membuka submenu dengan item terkunci", () => {
    const onDenied = vi.fn();
    act(() => root.render(<Dock menu={menu} homeLocked onLauncher={() => {}} onDenied={onDenied} />));
    const btns = q("[data-dock] > button");
    expect(btns.length).toBe(MENU_REGISTRY.length + 2); // Beranda + semua grup + Semua aplikasi
    const byName = (n: string) => btns.find((b) => b.getAttribute("aria-label")?.startsWith(n))!;
    expect(byName("Beranda").getAttribute("aria-label")).toContain("tidak ada akses");
    click(byName("Beranda"));
    expect(onDenied).toHaveBeenLastCalledWith("Beranda");
    click(byName("Pengaturan"));
    expect(onDenied).toHaveBeenLastCalledWith("Pengaturan");
    expect(byName("Collection").getAttribute("aria-label")).toBe("Collection"); // ada yang boleh → tanpa titik
    expect(byName("Tools Support").querySelector(".bg-danger")).toBeNull();
    click(byName("Collection"));
    const items = [...document.querySelectorAll<HTMLElement>("[role=menu] [role=menuitem]")];
    expect(items.map((i) => i.textContent)).toEqual(["Daftar Tagihan", "Case", "History Pembayaran BP"]);
    click(items[1]);
    expect(onDenied).toHaveBeenLastCalledWith("Collection › Case");
    expect(push).not.toHaveBeenCalled();
  });

  it("Spotlight: menu terkunci bisa dicari, bertanda, dan memilihnya hanya menampilkan pesan", () => {
    const onDenied = vi.fn(), onClose = vi.fn();
    act(() => root.render(<Spotlight open onClose={onClose} menu={menu} homeLocked canTagihan onDenied={onDenied} />));
    const input = document.querySelector<HTMLInputElement>("input[aria-label=Cari]")!;
    const first = q("[role=option]")[0];
    expect(first.textContent).toContain("Daftar Tagihan"); // yang bisa dibuka lebih dulu
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "upload data");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const hit = q("[role=option]").find((o) => o.textContent?.includes("Pusat Upload Data"))!;
    expect(hit.textContent).toContain("Tidak ada akses");
    expect(hit.querySelector(".bg-danger")).not.toBeNull();
    click(hit);
    expect(onDenied).toHaveBeenCalledWith("Pengaturan › Pusat Upload Data");
    expect(push).not.toHaveBeenCalled();
  });
});

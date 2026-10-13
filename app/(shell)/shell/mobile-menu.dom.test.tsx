// @vitest-environment happy-dom
// Menu HP (Fase 67): pegangan ^ → lembar deretan menu; grup → navigasi langsung / Semua aplikasi di grup itu.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { navMenu } from "@/lib/menu";
import { MobileMenu } from "./mobile-menu";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch: vi.fn() }), usePathname: () => "/collection" }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Akun Collection: hanya Daftar Tagihan & PDF Editor.
const menu = navMenu({ kind: "coll", allowed: new Set(["coll.tagihan", "tool.pdf"]) });
const onLauncher = vi.fn(), onDenied = vi.fn();
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  push.mockClear(); onLauncher.mockClear(); onDenied.mockClear();
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  act(() => root.render(<MobileMenu menu={menu} homeLocked onLauncher={onLauncher} onDenied={onDenied} />));
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
const btn = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const sheet = () => host.querySelector('[role="dialog"]');
const pointer = (el: Element, type: string, y: number) => act(() => {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientY: y }));
});

describe("menu HP", () => {
  it("hanya pegangan ^ sampai dibuka; ketuk → deretan menu lengkap + Cari aplikasi", () => {
    expect(sheet()).toBeNull();
    expect(host.querySelectorAll("button")).toHaveLength(1);
    act(() => btn("Buka menu").click());
    const labels = [...sheet()!.querySelectorAll("nav button")].map((b) => b.getAttribute("aria-label"));
    expect(labels).toHaveLength(menu.length + 2);
    expect(labels.at(-1)).toBe("Cari aplikasi");
    expect(labels[0]).toMatch(/^Beranda.+akses/); // Beranda terkunci
    expect(sheet()!.querySelector('[aria-current="page"]')?.getAttribute("aria-label")).toBe("Collection");
  });
  it("geser ke atas membuka, geser ke bawah menutup", () => {
    const handle = btn("Buka menu");
    pointer(handle, "pointerdown", 800); pointer(handle, "pointermove", 790);
    expect(sheet()).toBeNull(); // belum cukup jauh
    pointer(handle, "pointermove", 760);
    expect(sheet()).not.toBeNull();
    const head = btn("Tutup menu").parentElement!;
    pointer(head, "pointerdown", 500); pointer(head, "pointermove", 540);
    expect(sheet()).toBeNull();
  });
  it("grup: banyak submenu → Semua aplikasi di grup itu; terkunci → pesan; Cari aplikasi → launcher", () => {
    act(() => btn("Buka menu").click());
    act(() => btn("Collection").click());
    expect(onLauncher).toHaveBeenLastCalledWith("collection");
    expect(sheet()).toBeNull();
    act(() => btn("Buka menu").click());
    act(() => sheet()!.querySelector<HTMLButtonElement>('button[aria-label^="Billing"]')!.click());
    expect(onDenied).toHaveBeenCalledWith("Billing");
    act(() => btn("Buka menu").click());
    act(() => btn("Cari aplikasi").click());
    expect(onLauncher).toHaveBeenLastCalledWith();
  });
  it("grup dengan satu submenu yang bisa dibuka → langsung navigasi", () => {
    act(() => btn("Buka menu").click());
    act(() => btn("Tools Support").click());
    expect(push).toHaveBeenCalledWith("/tools/pdf-editor");
    expect(onLauncher).not.toHaveBeenCalled();
  });
});

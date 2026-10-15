// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TabBar } from "./tab-bar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const fn = { onSelect: vi.fn(), onClose: vi.fn(), onCloseOthers: vi.fn(), onReload: vi.fn() };
let host: HTMLDivElement, root: Root;
beforeEach(() => { Object.values(fn).forEach((f) => f.mockClear()); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const render = (paths: string[], active: string) => act(() => root.render(<TabBar tabs={paths.map((path, i) => ({ path, used: i }))} active={active} {...fn} />));
const tab = (name: string) => [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent === name)!;

it("menampilkan label menu, menandai tab aktif, klik = pindah, × / klik tengah = tutup", () => {
  render(["/", "/collection", "/mitra10"], "/collection");
  expect([...host.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(["Beranda", "Daftar Tagihan", "Mitra10 Tukar Faktur"]);
  expect(tab("Daftar Tagihan").getAttribute("aria-selected")).toBe("true");
  act(() => tab("Mitra10 Tukar Faktur").click());
  expect(fn.onSelect).toHaveBeenCalledWith("/mitra10");
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Tutup tab Beranda"]')!.click());
  expect(fn.onClose).toHaveBeenCalledWith("/");
  expect(fn.onSelect).toHaveBeenCalledTimes(1); // tombol × tidak ikut memilih tab
  act(() => { tab("Mitra10 Tukar Faktur").dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 1 })); });
  expect(fn.onClose).toHaveBeenLastCalledWith("/mitra10");
});
it("klik kanan: muat ulang & tutup tab lain; tab tunggal tidak bisa ditutup", () => {
  render(["/collection", "/mitra10"], "/mitra10");
  act(() => { tab("Daftar Tagihan").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 50, clientY: 20 })); });
  act(() => [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => b.textContent === "Tutup tab lain")!.click());
  expect(fn.onCloseOthers).toHaveBeenCalledWith("/collection");
  expect(host.querySelector('[role="menu"]')).toBeNull();
  render(["/collection"], "/collection");
  expect(host.querySelector('button[aria-label^="Tutup tab"]')).toBeNull();
});

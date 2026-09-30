// @vitest-environment happy-dom
// Tes interaksi overlay dengan komponen asli (Modal, Popover, Spotlight, useCommandK): form modal vs Ctrl/Cmd+K,
// Escape berlapis, kurungan Tab, inert & kunci scroll, urutan z, pembersihan saat unmount (pindah route).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useCallback, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Modal } from "./modal";
import { Popover } from "./popover";
import { useCommandK } from "@/app/(shell)/shell/use-command-k";
import { Spotlight } from "@/app/(shell)/shell/spotlight";
import { focusables, layerStack } from "./use-dialog";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/lib/local/store", () => ({ useLoadedDataset: () => ({ data: null, loading: false }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  expect(layerStack.size()).toBe(0);
});

const key = (k: string, o: KeyboardEventInit = {}) =>
  act(() => { (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...o })); });
const byLabel = (l: string) => document.querySelector<HTMLElement>(`[aria-label="${l}"]`);
const click = (el: Element | null) => act(() => { (el as HTMLElement).click(); });

function Shell({ withPopover = false }: { withPopover?: boolean }) {
  const [form, setForm] = useState(false);
  const [spot, setSpot] = useState(false);
  const [pop, setPop] = useState(false);
  const [inner, setInner] = useState(false);
  const toggle = useCallback(() => setSpot((s) => !s), []);
  useCommandK(toggle);
  return (
    <>
      <main>
        <button type="button" onClick={() => setForm(true)}>Catatan</button>
        <Modal open={form} title="Tambah catatan" onClose={() => setForm(false)}>
          <input aria-label="Isi" defaultValue="" />
          <button type="button" tabIndex={-1}>roving-mati</button>
          <button type="button" disabled>nonaktif</button>
          <button type="button" hidden>tersembunyi</button>
          {withPopover && (
            <span style={{ position: "relative" }}>
              <button type="button" data-popover-anchor onClick={() => setPop(true)}>Pilihan</button>
              <Popover open={pop} onClose={() => setPop(false)} label="Menu pilihan"><button type="button">Opsi A</button></Popover>
            </span>
          )}
          <button type="button" onClick={() => setInner(true)}>Konfirmasi</button>
          <Modal open={inner} title="Yakin?" onClose={() => setInner(false)}><button type="button">Ya</button></Modal>
          <button type="button">Simpan</button>
        </Modal>
      </main>
      <Spotlight open={spot} onClose={() => setSpot(false)} menu={[]} homeLocked={false} canTagihan={false} onDenied={() => {}} />
    </>
  );
}

describe("overlay: modal form vs Spotlight", () => {
  it("Ctrl/Cmd+K diabaikan selama form modal aktif; isi & fokus form utuh", () => {
    act(() => root.render(<Shell />));
    const trigger = [...document.querySelectorAll("button")].find((b) => b.textContent === "Catatan")!;
    trigger.focus();
    click(trigger);
    const input = byLabel("Isi") as HTMLInputElement;
    input.focus();
    input.value = "uji fase 42";
    for (const o of [{ ctrlKey: true }, { metaKey: true }]) {
      key("k", o);
      expect(byLabel("Pencarian")).toBeNull();
      expect(input.closest("[inert]")).toBeNull();
      expect(document.activeElement).toBe(input);
      expect((byLabel("Isi") as HTMLInputElement).value).toBe("uji fase 42");
    }
    key("Escape");
    expect(byLabel("Tambah catatan")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    // Setelah form ditutup pintasan berfungsi normal, Escape mengembalikan fokus ke pemicu.
    key("k", { ctrlKey: true });
    expect(byLabel("Pencarian")).not.toBeNull();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Cari");
    expect(document.querySelector("main")!.hasAttribute("inert")).toBe(true);
    key("Escape");
    expect(byLabel("Pencarian")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.querySelector("[inert]")).toBeNull();
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("Tab terkurung & melewati tabIndex -1, disabled, hidden", () => {
    act(() => root.render(<Shell />));
    click([...document.querySelectorAll("button")].find((b) => b.textContent === "Catatan")!);
    const dlg = byLabel("Tambah catatan")!;
    const names = focusables(dlg).map((e) => e.getAttribute("aria-label") ?? e.textContent);
    expect(names).toEqual(["Tutup", "Isi", "Konfirmasi", "Simpan"]);
    (document.querySelector<HTMLElement>("button[aria-label=Tutup]")!).focus();
    key("Tab", { shiftKey: true });
    expect(document.activeElement?.textContent).toBe("Simpan");
    key("Tab");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Tutup");
  });

  it("popover di dalam modal: Escape menutup popover dulu, lalu modal", () => {
    act(() => root.render(<Shell withPopover />));
    click([...document.querySelectorAll("button")].find((b) => b.textContent === "Catatan")!);
    const anchor = [...document.querySelectorAll("button")].find((b) => b.textContent === "Pilihan")!;
    anchor.focus();
    click(anchor);
    expect(byLabel("Menu pilihan")).not.toBeNull();
    key("Escape");
    expect(byLabel("Menu pilihan")).toBeNull();
    expect(byLabel("Tambah catatan")).not.toBeNull();
    key("Escape");
    expect(byLabel("Tambah catatan")).toBeNull();
  });

  it("modal bertumpuk: urutan z mengikuti tumpukan, latar tidak aktif terlalu cepat", () => {
    act(() => root.render(<Shell />));
    click([...document.querySelectorAll("button")].find((b) => b.textContent === "Catatan")!);
    const konfirmasi = [...document.querySelectorAll("button")].find((b) => b.textContent === "Konfirmasi")!;
    konfirmasi.focus(); // klik browser memfokuskan tombol; .click() di happy-dom tidak
    click(konfirmasi);
    const outer = byLabel("Tambah catatan")!, inner = byLabel("Yakin?")!;
    expect(outer.parentElement!.style.zIndex).toBe("calc(var(--z-modal) + 0)");
    expect(inner.parentElement!.style.zIndex).toBe("calc(var(--z-modal) + 1)");
    expect(inner.contains(document.activeElement)).toBe(true);
    expect(outer.querySelector("input")!.closest("[inert]")).not.toBeNull(); // isi modal luar tak bisa diklik/fokus
    key("Escape");
    expect(byLabel("Yakin?")).toBeNull();
    expect(outer.closest("[inert]")).toBeNull();
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.activeElement?.textContent).toBe("Konfirmasi");
    key("Escape");
    expect(document.querySelector("[inert]")).toBeNull();
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("unmount saat modal terbuka (pindah route) membersihkan inert, scroll lock & tumpukan", () => {
    act(() => root.render(<Shell />));
    click([...document.querySelectorAll("button")].find((b) => b.textContent === "Catatan")!);
    expect(layerStack.hasModal()).toBe(true);
    act(() => root.render(<div>halaman lain</div>));
    expect(layerStack.size()).toBe(0);
    expect(document.querySelector("[inert]")).toBeNull();
    expect(document.documentElement.style.overflow).toBe("");
  });
});

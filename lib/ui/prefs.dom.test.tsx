// @vitest-environment happy-dom
// Tema Sistem: perubahan tema OS memperbarui <html data-theme> dan hook tanpa reload; mode eksplisit tidak ditimpa.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PrefsSync } from "@/components/prefs-sync";
import { applyPrefs, useResolvedTheme, useTheme } from "./prefs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// matchMedia tiruan yang bisa "mengganti tema OS".
let osDark = false;
const mqListeners = new Set<() => void>();
function installMatchMedia() {
  window.matchMedia = ((q: string) => ({
    get matches() { return q.includes("dark") ? osDark : false; },
    media: q,
    addEventListener: (_: string, fn: () => void) => mqListeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => mqListeners.delete(fn),
  })) as unknown as typeof window.matchMedia;
  (globalThis as { matchMedia?: unknown }).matchMedia = window.matchMedia;
}
const setOs = (dark: boolean) => act(() => { osDark = dark; [...mqListeners].forEach((fn) => fn()); });

let host: HTMLDivElement, root: Root;
function Probe() {
  const [mode, setMode] = useTheme();
  const theme = useResolvedTheme();
  return <button type="button" data-mode={mode} data-theme={theme} onClick={() => setMode(mode === "light" ? "system" : "light")}>x</button>;
}
const probe = () => host.querySelector("button")!;
const html = () => document.documentElement.getAttribute("data-theme");

beforeEach(() => {
  installMatchMedia();
  osDark = false;
  localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); expect(mqListeners.size).toBe(0); });

describe("tema Sistem mengikuti OS tanpa reload", () => {
  it("Sistem: OS light → dark → light memperbarui html & komponen", () => {
    localStorage.setItem("prefs:theme", "system");
    applyPrefs();
    act(() => root.render(<><PrefsSync /><Probe /></>));
    expect(html()).toBe("light");
    setOs(true);
    expect(html()).toBe("dark");
    expect(probe().dataset.theme).toBe("dark");
    setOs(false);
    expect(html()).toBe("light");
    expect(probe().dataset.theme).toBe("light");
  });

  it("mode eksplisit tidak ditimpa OS; kembali ke Sistem langsung mengikuti OS", () => {
    localStorage.setItem("prefs:theme", "light");
    applyPrefs();
    act(() => root.render(<><PrefsSync /><Probe /></>));
    setOs(true);
    expect(html()).toBe("light");
    expect(probe().dataset.theme).toBe("light");
    act(() => probe().click()); // → system
    expect(localStorage.getItem("prefs:theme")).toBe("system");
    expect(html()).toBe("dark");
    expect(probe().dataset.theme).toBe("dark");
  });

  it("hanya PrefsSync (tanpa kontrol tema) tetap menerapkan perubahan OS; listener dibersihkan", () => {
    localStorage.setItem("prefs:theme", "system");
    applyPrefs();
    act(() => root.render(<PrefsSync />));
    expect(mqListeners.size).toBe(1);
    setOs(true);
    expect(html()).toBe("dark");
    localStorage.setItem("prefs:density", "compact");
    localStorage.setItem("prefs:transparency", "reduced");
    setOs(false);
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
    expect(document.documentElement.getAttribute("data-transparency")).toBe("reduced");
  });
});

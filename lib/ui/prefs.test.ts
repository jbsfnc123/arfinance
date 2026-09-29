import { describe, expect, it } from "vitest";
import { isDensity, isThemeMode, resolveTheme } from "./prefs";
import { PREFS_SCRIPT } from "./prefs-script";

describe("preferensi tema", () => {
  it("system mengikuti OS, dark/light tetap", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
  it("validasi nilai tersimpan", () => {
    expect([isThemeMode("dark"), isThemeMode("auto"), isDensity("compact"), isDensity("x")]).toEqual([true, false, true, false]);
  });
  it("skrip anti-kedip: default gelap & tidak melempar tanpa localStorage", () => {
    expect(PREFS_SCRIPT).toContain('"dark"');
    expect(PREFS_SCRIPT).toContain("data-theme");
    expect(() => new Function(PREFS_SCRIPT)).not.toThrow();
  });
  it("skrip anti-kedip menerapkan tema, kepadatan & kurangi transparansi", () => {
    const store: Record<string, string> = { "prefs:theme": "light", "prefs:density": "compact", "prefs:transparency": "reduced" };
    const attrs: Record<string, string> = {};
    new Function("localStorage", "document", "matchMedia", PREFS_SCRIPT)(
      { getItem: (k: string) => store[k] ?? null },
      { documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } } },
      () => ({ matches: true }),
    );
    expect(attrs).toEqual({ "data-theme": "light", "data-theme-mode": "light", "data-density": "compact", "data-transparency": "reduced" });
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Regresi kontras: badge status di baris berwarna (tr[data-mark]) harus ≥ 4,5:1 di tema terang & gelap.
// Nilai dibaca langsung dari token app/globals.css (bukan disalin), lalu dihitung dengan rumus WCAG.
const css = readFileSync("app/globals.css", "utf8");
function block(selector: string) {
  const start = css.indexOf(selector + " {");
  return css.slice(start, css.indexOf("\n}", start));
}
const tokens = (b: string) => Object.fromEntries([...b.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2].toLowerCase()]));
const THEMES = { gelap: tokens(block(":root")), terang: { ...tokens(block(":root")), ...tokens(block(':root[data-theme="light"]')) } };

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c: number[]) => {
  const v = c.map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const ratio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (a: number[], p: number, b: number[]) => a.map((c, i) => c * p + b[i] * (1 - p)); // color-mix(in srgb, a p%, b)

describe("kontras badge status di baris berwarna", () => {
  for (const [tema, t] of Object.entries(THEMES)) {
    for (const [status, fg] of [["success", "--badge-success-fg"], ["warning", "--badge-warning-fg"], ["danger", "--badge-danger-fg"]] as const) {
      it(`${tema}: ${status} ≥ 4,5:1 di atas latar badge opak`, () => {
        expect(t[fg], `${fg} ada`).toBeTruthy();
        const bg = mix(rgb(t[`--${status}`]), 0.2, rgb(t["--surface"]));
        expect(ratio(rgb(t[fg]), bg)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
  it("aturan badge di baris berwarna memakai latar opak (bukan transparan)", () => {
    const rules = [...css.matchAll(/tr\[data-mark\] \[data-badge\]\.text-(success|warning|danger) \{([^}]*)\}/g)];
    expect(rules.map((r) => r[1]).sort()).toEqual(["danger", "success", "warning"]);
    for (const r of rules) expect(r[2]).toMatch(new RegExp(`color-mix\\(in srgb, var\\(--${r[1]}\\) 20%, var\\(--surface\\)\\)`));
  });
});

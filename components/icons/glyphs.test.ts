import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { GLYPHS } from "./glyphs";
import { APP_ICON_GLYPHS } from "@/lib/ui/app-icons";
import { MENU_REGISTRY as MENU, FINANCE_NAV } from "@/lib/menu";
import { WORKSPACES } from "@/lib/workspace";

// Semua nama ikon yang dipakai source harus ada di registry (pengganti font Material Symbols).
function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

function namesInSource() {
  const names = new Set<string>();
  for (const f of ["app", "components", "lib"].flatMap((d) => walk(d))) {
    const s = readFileSync(f, "latin1");
    for (const m of s.matchAll(/<Icon\s+name="([a-z0-9_]+)"/g)) names.add(m[1]);
    // name={…} dinamis: literal string di posisi hasil ternary (bukan pembanding)
    for (const m of s.matchAll(/<Icon\s+name=\{([^}]*)\}/g)) for (const l of m[1].matchAll(/(?:^|[?:])\s*"([a-z0-9_]+)"/g)) names.add(l[1]);
    // array TABS / peta ikon: { icon: "x" } / { i: "x" }
    for (const m of s.matchAll(/\b(?:icon|i)\s*:\s*"([a-z][a-z0-9_]*)"/g)) names.add(m[1]);
  }
  return names;
}

describe("registry ikon", () => {
  it("tidak ada lagi pemakaian font Material Symbols", () => {
    const left = ["app", "components", "lib"].flatMap((d) => walk(d)).filter((f) => readFileSync(f, "latin1").includes("material-symbols"));
    expect(left).toEqual([]);
  });
  it("mencakup semua nama ikon di source", () => {
    const missing = [...namesInSource()].filter((n) => !GLYPHS[n] && !["mutasi", "erp", "target"].includes(n));
    expect(missing).toEqual([]);
  });
  it("mencakup ikon menu, Finance, workspace & ikon aplikasi", () => {
    const want = [...MENU.map((g) => g.icon), ...FINANCE_NAV.map((n) => n.icon), ...Object.values(WORKSPACES).map((w) => w.icon), ...APP_ICON_GLYPHS];
    expect(want.filter((n) => !GLYPHS[n])).toEqual([]);
  });
  it("glyph hanya berisi elemen SVG sederhana", () => {
    for (const [k, v] of Object.entries(GLYPHS)) expect(v, k).toMatch(/^(<(path|circle|rect|ellipse)\b[^<>]*\/>)+$/);
  });
});

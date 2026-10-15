// Registri tab harus sejalan dengan page.tsx: route ada, menuGuard memakai menu yang sama, dan halaman yang membaca
// data di server (createClient) tidak didaftarkan (datanya tidak akan dimuat oleh view saja).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TAB_VIEW_PATHS, tabViewMenuId } from "./tab-views";

const pageOf = (path: string) => join(__dirname, path === "/" ? "" : path.slice(1), "page.tsx");

describe("registri view tab", () => {
  it.each(TAB_VIEW_PATHS)("%s sejalan dengan page.tsx", (path) => {
    const file = pageOf(path);
    expect(existsSync(file)).toBe(true);
    const src = readFileSync(file, "utf8");
    expect(src).toContain(`menuGuard("${tabViewMenuId(path)}")`);
    expect(src).not.toContain("createClient");
  });
});

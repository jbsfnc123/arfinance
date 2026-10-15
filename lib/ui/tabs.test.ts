import { describe, expect, it } from "vitest";
import { closeOthers, closeTab, openTab, sanitizeTabs, type ShellTab } from "./tabs";

const T = (...p: string[]): ShellTab[] => p.map((path, i) => ({ path, used: i + 1 }));
const paths = (t: ShellTab[]) => t.map((x) => x.path);

describe("tab shell", () => {
  it("path baru disisipkan di kanan tab asal; path lama hanya diaktifkan", () => {
    expect(paths(openTab(T("/a", "/b", "/c"), "/x", "/a", 9).tabs)).toEqual(["/a", "/x", "/b", "/c"]);
    expect(paths(openTab([], "/a", null, 1).tabs)).toEqual(["/a"]);
    const r = openTab(T("/a", "/b"), "/a", "/b", 9);
    expect(paths(r.tabs)).toEqual(["/a", "/b"]);
    expect(r.tabs[0].used).toBe(9);
  });
  it("lebih dari batas → tab paling lama tidak dipakai ditutup", () => {
    const base: ShellTab[] = [{ path: "/a", used: 5 }, { path: "/b", used: 1 }, { path: "/c", used: 3 }];
    const r = openTab(base, "/d", "/c", 9, 3);
    expect(r.evicted).toBe("/b");
    expect(paths(r.tabs)).toEqual(["/a", "/c", "/d"]);
  });
  it("menutup tab aktif pindah ke tetangga; tab terakhir tetap", () => {
    expect(closeTab(T("/a", "/b", "/c"), "/b", "/b")).toEqual({ tabs: T("/a", "/b", "/c").filter((t) => t.path !== "/b"), go: "/c" });
    expect(closeTab(T("/a", "/b", "/c"), "/c", "/c").go).toBe("/b");
    expect(closeTab(T("/a", "/b"), "/a", "/b").go).toBeNull();
    expect(paths(closeTab(T("/a"), "/a", "/a").tabs)).toEqual(["/a"]);
    expect(paths(closeOthers(T("/a", "/b", "/c"), "/b"))).toEqual(["/b"]);
  });
  it("isi tersimpan yang rusak dibersihkan", () => {
    expect(sanitizeTabs("x")).toEqual([]);
    expect(paths(sanitizeTabs([{ path: "/a", used: 1 }, { path: "/a", used: 2 }, { path: "b", used: 1 }, null]))).toEqual(["/a"]);
  });
});

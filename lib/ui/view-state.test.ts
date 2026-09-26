import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearViewState, ensureViewOwner, readViewState, writeViewState } from "./view-state";

class MemStorage {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}
let store: MemStorage;
const g = globalThis as unknown as { window?: { sessionStorage: MemStorage } };

describe("state tampilan (sessionStorage)", () => {
  beforeEach(() => { store = new MemStorage(); g.window = { sessionStorage: store }; clearViewState(); });
  afterEach(() => { clearViewState(); delete g.window; });

  it("simpan & baca: referensi stabil, Set ↔ array, hapus dengan undefined", () => {
    writeViewState("t:q", "abc");
    expect(readViewState("t:q")).toBe("abc");
    writeViewState("t:f", { gr: "Done" });
    const a = readViewState("t:f"); const b = readViewState("t:f");
    expect(a).toEqual({ gr: "Done" }); expect(a).toBe(b);
    writeViewState("t:sel", new Set([1, 2]), { set: true });
    expect(store.getItem("view:t:sel")).toBe("[1,2]");
    expect(readViewState<Set<number>>("t:sel", { set: true })).toEqual(new Set([1, 2]));
    writeViewState("t:q", undefined);
    expect(readViewState("t:q")).toBeUndefined();
  });

  it("nilai rusak diabaikan; perubahan dari luar terbaca", () => {
    store.setItem("view:x", "{rusak");
    expect(readViewState("x")).toBeUndefined();
    store.setItem("view:x", '"baru"');
    expect(readViewState("x")).toBe("baru");
  });

  it("akun lain di tab yang sama → state lama dibuang; logout membersihkan", () => {
    ensureViewOwner("u1");
    writeViewState("coll", "Yovita");
    ensureViewOwner("u1");
    expect(readViewState("coll")).toBe("Yovita");
    ensureViewOwner("u2");
    expect(readViewState("coll")).toBeUndefined();
    writeViewState("coll", "Letitia");
    clearViewState();
    expect(readViewState("coll")).toBeUndefined();
    expect(store.length).toBe(0);
  });

  it("tanpa sessionStorage tetap jalan di memori", () => {
    delete g.window;
    writeViewState("m", 5);
    expect(readViewState("m")).toBe(5);
  });
});

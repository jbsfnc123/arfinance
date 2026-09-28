import { describe, expect, it } from "vitest";
import { ACL_MENU_IDS, HOME_ITEM, aclGroups, canEnterWorkspace, homeWorkspace, MENU_REGISTRY, canAccess, findMenuById, findMenuByHref, firstAllowedHref, menusDiffer, visibleMenu } from "./menu";

const item = (id: string) => MENU_REGISTRY.flatMap((g) => g.children).find((c) => c.id === id)!;

describe("ACL menu", () => {
  it("Super Admin melihat semua menu", () => {
    const total = MENU_REGISTRY.reduce((n, g) => n + g.children.length, 0);
    const seen = visibleMenu({ kind: "sa", allowed: new Set() }).reduce((n, g) => n + g.children.length, 0);
    expect(seen).toBe(total);
  });

  it("deny-by-default: user tanpa ACL tidak melihat apa pun", () => {
    expect(visibleMenu({ kind: "ctrl", allowed: new Set() })).toEqual([]);
  });

  it("menu 'sa' tetap tersembunyi walau ada di ACL controller", () => {
    expect(canAccess(item("set.update"), { kind: "coll", allowed: new Set(["set.update"]) })).toBe(false);
  });

  it("menu 'ctrl' tersembunyi untuk collection walau ada di ACL", () => {
    expect(canAccess(item("dash.coll"), { kind: "coll", allowed: new Set(["dash.coll"]) })).toBe(false);
    expect(canAccess(item("dash.coll"), { kind: "ctrl", allowed: new Set(["dash.coll"]) })).toBe(true);
  });

  it("ID submenu unik dan href internal unik", () => {
    const all = MENU_REGISTRY.flatMap((g) => g.children);
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    const internal = all.filter((c) => !c.external).map((c) => c.href);
    expect(new Set(internal).size).toBe(internal.length);
  });

  it("findMenuByHref menemukan route internal", () => {
    expect(findMenuByHref("/coretax")?.item.id).toBe("rek.coretax");
    expect(findMenuByHref("/tidak-ada")).toBeNull();
  });
});

describe("Beranda", () => {
  it("diatur lewat centang ACL, Super Admin selalu bisa", () => {
    expect(findMenuById("home")?.item).toBe(HOME_ITEM);
    expect(canAccess(HOME_ITEM, { kind: "sa", allowed: new Set() })).toBe(true);
    expect(canAccess(HOME_ITEM, { kind: "kurir", allowed: new Set(["home"]) })).toBe(true);
    expect(canAccess(HOME_ITEM, { kind: "ctrl", allowed: new Set(["dash.coll"]) })).toBe(false);
  });

  it("tanpa Beranda diarahkan ke menu internal pertama yang diizinkan", () => {
    expect(firstAllowedHref({ kind: "coll", allowed: new Set(["bill.detail", "coll.tagihan"]) })).toBe("/collection");
    expect(firstAllowedHref({ kind: "coll", allowed: new Set(["bill.detail"]) })).toBeNull();
    expect(firstAllowedHref({ kind: "coll", allowed: new Set() })).toBeNull();
  });
});

describe("akses workspace (divisi akun)", () => {
  const acc = (kind: string, division?: "ar" | "ap" | "both") => ({ kind, allowed: new Set<string>(), division });
  it("Super Admin semua; AR + AP boleh portal; divisi tunggal hanya workspace-nya", () => {
    for (const ws of ["finance", "ar", "ap"] as const) expect(canEnterWorkspace(ws, acc("sa", "ar"))).toBe(true);
    expect(canEnterWorkspace("finance", acc("ctrl", "both"))).toBe(true);
    expect(canEnterWorkspace("ap", acc("ctrl", "both"))).toBe(true);
    expect(canEnterWorkspace("finance", acc("coll", "ar"))).toBe(false);
    expect(canEnterWorkspace("ap", acc("coll", "ar"))).toBe(false);
    expect(canEnterWorkspace("ap", acc("ctrl", "ap"))).toBe(true);
    expect(canEnterWorkspace("ar", acc("ctrl", "ap"))).toBe(false);
    expect(canEnterWorkspace("ar", acc("kurir"))).toBe(true); // default divisi AR
  });
  it("tujuan setelah login", () => {
    expect(homeWorkspace(acc("sa", "ap"))).toBe("finance");
    expect(homeWorkspace(acc("ctrl", "both"))).toBe("finance");
    expect(homeWorkspace(acc("coll", "ar"))).toBe("ar");
    expect(homeWorkspace(acc("ctrl", "ap"))).toBe("ap");
  });
  it("menu admin pusat tidak lagi di AR", () => {
    const ids = MENU_REGISTRY.flatMap((g) => g.children.map((c) => c.id));
    expect(ids).not.toContain("set.akun");
    expect(ids).not.toContain("set.acl");
    expect(ids).not.toContain("set.database");
  });
});

describe("akses Aplikasi Kolektor", () => {
  const acc = (kind: string, menus: string[], division: "ar" | "ap" | "both" = "ar") => ({ kind, allowed: new Set(menus), division });
  it("butuh menu Aplikasi Kolektor (apa pun divisinya); Kurir diarahkan ke kolektor", () => {
    expect(canEnterWorkspace("kolektor", acc("kurir", ["tukar.detail"]))).toBe(true);
    expect(canEnterWorkspace("kolektor", acc("ctrl", ["tukar.detail"], "ap"))).toBe(true);
    expect(canEnterWorkspace("kolektor", acc("coll", ["coll.tagihan"]))).toBe(false);
    expect(canEnterWorkspace("kolektor", acc("sa", []))).toBe(true);
    expect(homeWorkspace(acc("kurir", ["tukar.detail"]))).toBe("kolektor");
    expect(homeWorkspace(acc("kurir", []))).toBe("ar"); // tanpa menu kolektor tetap ke divisinya
    expect(homeWorkspace(acc("ctrl", ["tukar.detail"], "both"))).toBe("finance");
  });
});

describe("akses menu per akun", () => {
  it("checklist memuat Beranda & semua submenu tanpa duplikat", () => {
    const ids = aclGroups().flatMap((g) => g.items.map((i) => i.id));
    expect(ids).toContain("home");
    expect(ids).toContain("tukar.ekspedisi");
    expect(new Set(ids).size).toBe(ids.length);
    expect(ACL_MENU_IDS.has("home")).toBe(true);
  });
  it("menusDiffer: urutan diabaikan, id tak dikenal diabaikan", () => {
    expect(menusDiffer(["home", "coll.tagihan"], ["coll.tagihan", "home"])).toBe(false);
    expect(menusDiffer(["home", "menu.lama"], ["home"])).toBe(false);
    expect(menusDiffer(["home"], ["home", "coll.tagihan"])).toBe(true);
    expect(menusDiffer(["home", "coll.case"], ["home", "coll.tagihan"])).toBe(true);
  });
});

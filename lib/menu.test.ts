import { describe, expect, it } from "vitest";
import { HOME_ITEM, wsItem, canEnterWorkspace, MENU_REGISTRY, canAccess, findMenuById, findMenuByHref, firstAllowedHref, visibleMenu } from "./menu";

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

describe("akses workspace", () => {
  it("ws.ar / ws.ap lewat centang, Super Admin selalu bisa", () => {
    expect(findMenuById("ws.ap")?.item).toBe(wsItem("ap"));
    expect(canAccess(wsItem("ar"), { kind: "ctrl", allowed: new Set(["ws.ar"]) })).toBe(true);
    expect(canAccess(wsItem("ap"), { kind: "ctrl", allowed: new Set(["ws.ar"]) })).toBe(false);
    expect(canAccess(wsItem("ap"), { kind: "sa", allowed: new Set() })).toBe(true);
  });
  it("Finance khusus Super Admin", () => {
    expect(canEnterWorkspace("finance", { kind: "sa", allowed: new Set() })).toBe(true);
    expect(canEnterWorkspace("finance", { kind: "ctrl", allowed: new Set(["ws.ar", "ws.ap"]) })).toBe(false);
    expect(canEnterWorkspace("ar", { kind: "coll", allowed: new Set(["ws.ar"]) })).toBe(true);
    expect(canEnterWorkspace("ap", { kind: "coll", allowed: new Set(["ws.ar"]) })).toBe(false);
  });
  it("menu admin pusat tidak lagi di AR", () => {
    const ids = MENU_REGISTRY.flatMap((g) => g.children.map((c) => c.id));
    expect(ids).not.toContain("set.akun");
    expect(ids).not.toContain("set.acl");
    expect(ids).not.toContain("set.database");
  });
});

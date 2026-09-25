import { describe, expect, it } from "vitest";
import { MENU_REGISTRY, canAccess, findMenuByHref, visibleMenu } from "./menu";

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
    expect(canAccess(item("set.acl"), { kind: "ctrl", allowed: new Set(["set.acl"]) })).toBe(false);
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

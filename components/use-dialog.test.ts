import { describe, expect, it } from "vitest";
import { layerStack, trapIndex } from "./use-dialog";

describe("tumpukan overlay", () => {
  it("hanya overlay teratas yang aktif; lepas dari tengah tidak merusak urutan", () => {
    const a = layerStack.push(), b = layerStack.push(), c = layerStack.push();
    expect([layerStack.isTop(a), layerStack.isTop(b), layerStack.isTop(c)]).toEqual([false, false, true]);
    layerStack.remove(b);
    expect(layerStack.isTop(c)).toBe(true);
    layerStack.remove(c);
    expect(layerStack.isTop(a)).toBe(true);
    layerStack.remove(a);
    expect(layerStack.size()).toBe(0);
  });
});

describe("kurungan Tab", () => {
  it("membungkus di ujung, bebas di tengah", () => {
    expect(trapIndex(3, 2, false)).toBe(0);
    expect(trapIndex(3, 0, true)).toBe(2);
    expect(trapIndex(3, 1, false)).toBe(-1);
    expect(trapIndex(3, 1, true)).toBe(-1);
  });
  it("fokus di luar daftar masuk ke ujung; tanpa elemen fokus ditahan", () => {
    expect(trapIndex(3, -1, false)).toBe(0);
    expect(trapIndex(3, -1, true)).toBe(2);
    expect(trapIndex(0, -1, false)).toBe(-2);
  });
});

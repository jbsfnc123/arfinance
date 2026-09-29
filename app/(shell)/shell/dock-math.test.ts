import { describe, expect, it } from "vitest";
import { clampPanelX, dockSizes } from "./dock-math";

describe("Dock: pembesaran", () => {
  const centers = [22, 70, 118, 166, 214]; // jarak antar-pusat 48px
  it("kursor di luar Dock → semua ukuran dasar", () => {
    expect(dockSizes(null, centers, 44, 56)).toEqual([44, 44, 44, 44, 44]);
  });
  it("ikon di bawah kursor maksimum, tetangga di antaranya, jauh tetap dasar", () => {
    const s = dockSizes(118, centers, 44, 56);
    expect(s[2]).toBe(56);
    expect(s[1]).toBe(s[3]);
    expect(s[1]).toBeGreaterThan(47);
    expect(s[1]).toBeLessThan(53);
    expect(s[0]).toBeLessThan(s[1]);
    expect(Math.min(...s)).toBeGreaterThanOrEqual(44);
  });
  it("kurva halus: bergeser sedikit tidak melompat", () => {
    const a = dockSizes(118, centers, 44, 56), b = dockSizes(122, centers, 44, 56);
    a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(1.5));
  });
});

describe("Dock: posisi submenu", () => {
  it("berpusat di ikon bila muat", () => expect(clampPanelX(600, 280, 1366)).toBe(460));
  it("dijepit di tepi kiri & kanan", () => {
    expect(clampPanelX(40, 280, 1366)).toBe(12);
    expect(clampPanelX(1350, 280, 1366)).toBe(1366 - 280 - 12);
  });
});

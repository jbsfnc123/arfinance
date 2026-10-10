import { describe, expect, it } from "vitest";
import { isChatOrigin, isWithin, menuLabel } from "./chat-context";

describe("halaman aktif untuk chat AR Helpdesk", () => {
  it("label menu dari path (paling spesifik)", () => {
    expect(menuLabel("/collection")).toBe("Collection › Daftar Tagihan");
    expect(menuLabel("/collection/history-pembayaran")).toBe("Collection › History Pembayaran BP");
    expect(menuLabel("/mutasi-bank")).toContain("Mutasi Bank vs Realisasi");
  });
  it("hanya origin Apps Script yang dilayani", () => {
    expect(isChatOrigin("https://n-abc123def-0lu-script.googleusercontent.com")).toBe(true);
    expect(isChatOrigin("https://script.google.com")).toBe(true);
    expect(isChatOrigin("https://evil.example.com")).toBe(false);
    expect(isChatOrigin("https://googleusercontent.com.evil.io")).toBe(false);
  });
  it("isWithin: frame chat atau turunannya saja", () => {
    const inner = {} as Window;
    const frame = { frames: Object.assign([inner], { length: 1 }) } as unknown as Window;
    expect(isWithin(frame, inner)).toBe(true);
    expect(isWithin(frame, {} as Window)).toBe(false);
    expect(isWithin(null, inner)).toBe(false);
  });
});

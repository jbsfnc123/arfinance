import { describe, expect, it } from "vitest";
import { chatContextSnapshot, isChatOrigin, isWithin, MAX_CHARS, menuLabel, publishChatContext } from "./chat-context";

describe("ringkasan halaman untuk chat QnA", () => {
  it("label menu dari path (paling spesifik)", () => {
    expect(menuLabel("/collection")).toBe("Collection › Daftar Tagihan");
    expect(menuLabel("/collection/history-pembayaran")).toBe("Collection › History Pembayaran BP");
    expect(menuLabel("/mutasi-bank")).toContain("Mutasi Bank vs Realisasi");
  });
  it("maks 50 baris total, sumber terbaru dulu, dan ukuran JSON dibatasi", () => {
    const big = (n: number) => Array.from({ length: n }, (_, i) => [`INV-${i}`, "x".repeat(200), i]);
    publishChatContext("a", { title: "A", rows: big(40), total: 400 });
    publishChatContext("b", { title: "B", summary: { Total: 5 }, rows: big(40), total: 40 });
    const snap = chatContextSnapshot("/collection", "2026-10-08");
    expect(snap.menu).toBe("Collection › Daftar Tagihan");
    expect(snap.sources.map((s) => s.title)).toEqual(["B", "A"]);
    expect(snap.sources.reduce((n, s) => n + s.rows.length, 0)).toBeLessThanOrEqual(50);
    expect(snap.sources[1].total).toBe(400);
    expect(JSON.stringify(snap).length).toBeLessThanOrEqual(MAX_CHARS);
    expect(String(snap.sources[0].rows[0][1]).length).toBeLessThanOrEqual(80); // sel dipotong
    publishChatContext("a", null); publishChatContext("b", null);
    expect(chatContextSnapshot("/", "2026-10-08").sources).toEqual([]);
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

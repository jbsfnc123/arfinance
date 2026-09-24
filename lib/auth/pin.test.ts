import { describe, expect, it } from "vitest";
import { derivePassword, isValidPin, syntheticEmail } from "./pin";

describe("PIN", () => {
  it("hanya menerima tepat 6 digit angka", () => {
    expect(isValidPin("060814")).toBe(true);
    expect(isValidPin("12345")).toBe(false);
    expect(isValidPin("1234567")).toBe(false);
    expect(isValidPin("12a456")).toBe(false);
    expect(isValidPin(" 12345")).toBe(false);
  });

  it("password turunan deterministik, beda per user dan per rahasia", () => {
    const a = derivePassword("user-a", "s1");
    expect(derivePassword("user-a", "s1")).toBe(a);
    expect(derivePassword("user-b", "s1")).not.toBe(a);
    expect(derivePassword("user-a", "s2")).not.toBe(a);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });

  it("gagal jelas bila rahasia belum diset", () => {
    expect(() => derivePassword("user-a", "")).toThrow("PIN_AUTH_SECRET");
  });

  it("email sintetis memakai domain lokal", () => {
    expect(syntheticEmail("abc")).toBe("abc@pin.arfinance.local");
  });
});

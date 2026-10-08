import { describe, expect, it } from "vitest";
import { weakPin } from "./pin-rules";

describe("weakPin", () => {
  it("menolak bukan 6 digit", () => {
    expect(weakPin("12345")).toMatch(/6 digit/);
    expect(weakPin("12a456")).toMatch(/6 digit/);
  });
  it("menolak digit sama & urutan", () => {
    for (const p of ["000000", "777777", "123456", "456789", "654321", "987654"]) {
      expect(weakPin(p)).toMatch(/mudah ditebak/);
    }
  });
  it("menerima kombinasi biasa", () => {
    for (const p of ["482915", "120394", "112233"]) expect(weakPin(p)).toBeNull();
  });
});

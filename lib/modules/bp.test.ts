import { describe, expect, it } from "vitest";
import { bpShort } from "./bp";

describe("nama BP ringkas", () => {
  it("ambil teks setelah ' - ' terakhir", () => {
    expect(bpShort("Catur Mitra Sejati Sentosa - Batam")).toBe("Batam");
    expect(bpShort("A - B - C")).toBe("C");
    expect(bpShort("Toko Tanpa Cabang")).toBe("Toko Tanpa Cabang");
    expect(bpShort("PT Maju-Jaya")).toBe("PT Maju-Jaya"); // tanda hubung tanpa spasi bukan pemisah
    expect(bpShort(null)).toBe("");
  });
});

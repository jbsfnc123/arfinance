import { describe, expect, it } from "vitest";
import { hitungKomisi, pphPasal17 } from "./pph";

describe("PPh komisi", () => {
  it("orang pribadi: 50% bruto × Pasal 17", () => {
    expect(hitungKomisi("orang", [10_000_000]).pph).toBe(250_000);
    expect(hitungKomisi("orang", [200_000_000]).pph).toBe(9_000_000);
  });
  it("progresif atas akumulasi baris", () => {
    const r = hitungKomisi("orang", [100_000_000, 100_000_000]);
    expect(r.rows[0].pph).toBe(2_500_000);
    expect(r.rows[1].pph).toBe(6_500_000);
    expect(r.rows[1].tarif).toBe("5% + 15%");
    expect(r.pph).toBe(9_000_000);
    expect(r.neto).toBe(191_000_000);
  });
  it("badan: PPh 23 2%", () => {
    expect(hitungKomisi("badan", [10_000_000]).pph).toBe(200_000);
  });
  it("lapisan tertinggi", () => {
    expect(pphPasal17(6_000_000_000)).toBe(3_000_000 + 28_500_000 + 62_500_000 + 1_350_000_000 + 350_000_000);
  });
});

import { describe, expect, it } from "vitest";
import { applyFlags, flagErrorMessage, flagOf, tandaOf, type RowFlag } from "./row-flags";

describe("tanda Tolakan / LTKP / Litigasi", () => {
  it("nilai server ↔ label tampilan; tanpa tanda = Normal", () => {
    expect([tandaOf("tolakan"), tandaOf("ltkp"), tandaOf("litigasi"), tandaOf(null), tandaOf(undefined)]).toEqual(["Tolakan", "LTKP", "Litigasi", "Normal", "Normal"]);
    expect([flagOf("Tolakan"), flagOf("LTKP"), flagOf("Litigasi"), flagOf("Normal")]).toEqual(["tolakan", "ltkp", "litigasi", null]);
  });
  it("tandai banyak sekaligus, baris lain tetap, Normal = tanda dihapus", () => {
    const list: RowFlag[] = [{ id: 1, flag: "litigasi" }, { id: 5, flag: "ltkp" }];
    expect(applyFlags(list, [1, 3, 3], "ltkp")).toEqual([{ id: 1, flag: "ltkp" }, { id: 3, flag: "ltkp" }, { id: 5, flag: "ltkp" }]);
    expect(applyFlags(list, [1], null)).toEqual([{ id: 5, flag: "ltkp" }]);
  });
  it("pesan kegagalan", () => {
    expect(flagErrorMessage({ code: "42501" })).toMatch(/tidak punya akses/);
    expect(flagErrorMessage(null)).toMatch(/Periksa koneksi/);
  });
});

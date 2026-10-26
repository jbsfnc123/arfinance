import { describe, expect, it } from "vitest";
import { confirmText, periodLabel, rowsToSheet } from "./upload-delete";

describe("hapus data upload", () => {
  it("label & teks konfirmasi periode", () => {
    expect(periodLabel("2026-09")).toBe("September 2026");
    expect(periodLabel("semua")).toBe("Semua data");
    expect(periodLabel("(tanpa tanggal)")).toBe("(tanpa tanggal)");
    expect(confirmText("2026-09")).toBe("2026-09");
    expect(confirmText("semua")).toBe("HAPUS SEMUA");
  });
  it("baris ekspor → sheet", () => {
    expect(rowsToSheet([{ a: 1, b: { x: 1 } }, { a: 2, c: null }])).toEqual([["a", "b", "c"], [1, '{"x":1}', undefined], [2, undefined, null]]);
  });
});

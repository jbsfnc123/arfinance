import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { safeFileName, safeSheetName } from "./xlsx-client";

describe("nama sheet Excel", () => {
  it("nama cadangan 'History' diganti (penyebab tombol Excel modal History Pembayaran diam)", () => {
    expect(safeSheetName("History")).toBe("History 1");
    expect(safeSheetName("history")).toBe("History 1");
    expect(safeSheetName("History Pembayaran")).toBe("History Pembayaran");
  });
  it("karakter terlarang, panjang, kosong, petik & duplikat", () => {
    expect(safeSheetName("Invoice: 2026/09 [A]*?")).toBe("Invoice 2026 09 A");
    expect(safeSheetName("x".repeat(40))).toHaveLength(31);
    expect(safeSheetName("  ")).toBe("Sheet");
    expect(safeSheetName("'Data'")).toBe("Data");
    const used = new Set<string>();
    expect([safeSheetName("Data", used), safeSheetName("data", used), safeSheetName("DATA", used)]).toEqual(["Data", "data (2)", "DATA (3)"]);
  });
  it("hasilnya diterima SheetJS", () => {
    const used = new Set<string>();
    for (const n of ["History", "a/b:c", "Tukar Faktur Mitra10 September 2026 panjang sekali", "[x]", "History"]) {
      const wb = XLSX.utils.book_new();
      expect(() => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[1]]), safeSheetName(n, used))).not.toThrow();
    }
  });
});

describe("nama file", () => {
  it("karakter terlarang diganti, ekstensi dijaga", () => {
    expect(safeFileName("History Pembayaran PT A/B: C?.xlsx")).toBe("History Pembayaran PT A_B_ C_.xlsx");
    expect(safeFileName("Tagihan_Angela")).toBe("Tagihan_Angela.xlsx");
    expect(safeFileName("  ..  ")).toBe("export.xlsx");
    expect(safeFileName("a".repeat(300)).length).toBe(155);
  });
});

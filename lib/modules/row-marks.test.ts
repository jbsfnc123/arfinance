import { describe, expect, it } from "vitest";
import { applyMarks, markErrorMessage, markSummary, type RowMark, type RowMarkColor } from "./row-marks";

const map = (entries: [number, RowMarkColor][]) => new Map(entries);

describe("ringkasan warna target", () => {
  it("tanpa warna, satu warna, campuran (termasuk campur dengan tanpa warna)", () => {
    expect(markSummary([1, 2], map([]))).toEqual({ kind: "none" });
    expect(markSummary([1, 2], map([[1, "mint"], [2, "mint"]]))).toEqual({ kind: "single", color: "mint" });
    expect(markSummary([1, 2], map([[1, "mint"], [2, "blue"]]))).toEqual({ kind: "mixed" });
    expect(markSummary([1, 2], map([[1, "mint"]]))).toEqual({ kind: "mixed" });
  });
});

describe("terapkan & hapus warna hanya pada target", () => {
  const list: RowMark[] = [{ id: 1, color: "blue" }, { id: 5, color: "lavender" }];
  it("ganti warna target, baris lain tetap, tidak ada duplikat per baris", () => {
    const out = applyMarks(list, [1, 3, 3], "mint");
    expect(out).toEqual([{ id: 1, color: "mint" }, { id: 3, color: "mint" }, { id: 5, color: "lavender" }]);
  });
  it("hapus warna = anotasi target dihilangkan, bukan warna keempat", () => {
    expect(applyMarks(list, [1], null)).toEqual([{ id: 5, color: "lavender" }]);
    expect(applyMarks(list, [9], null)).toEqual(list);
  });
});

describe("pesan kegagalan", () => {
  it("akses ditolak, baris hilang, dan jaringan punya pesan berbeda yang bisa ditindaklanjuti", () => {
    expect(markErrorMessage({ code: "42501" })).toMatch(/tidak punya akses/);
    expect(markErrorMessage({ code: "P0002", message: "2 baris tidak ditemukan di Kertas Kerja" })).toMatch(/2 baris tidak ditemukan.*Muat ulang/);
    expect(markErrorMessage(null)).toMatch(/Periksa koneksi/);
  });
});

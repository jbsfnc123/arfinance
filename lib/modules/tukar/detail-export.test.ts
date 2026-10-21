import { describe, expect, it } from "vitest";
import { tukarDays } from "./dashboard";
import { tukarDetailSheets, type TukarDone } from "./detail-export";

const done: TukarDone[] = [
  { tanggal_tukar: "2026-10-02", kurir: "Andi", business_partner: "Toko B", invoice_no: "INV-2", kode: "02-10-26-101500" },
  { tanggal_tukar: "2026-10-02", kurir: "Andi", business_partner: "Toko A", invoice_no: "INV-1", kode: "02-10-26-101500" },
  { tanggal_tukar: "2026-10-02", kurir: "Andi", business_partner: "Toko A", invoice_no: "INV-3", kode: "02-10-26-101500" },
  { tanggal_tukar: "2026-10-01", kurir: "Budi", business_partner: "Toko C", invoice_no: "INV-4", kode: "01-10-26-090000" },
  { tanggal_tukar: "2026-10-03", kurir: null, business_partner: "Toko D", invoice_no: null, kode: "03-10-26-080000" },
  { tanggal_tukar: "2026-09-30", kurir: "Andi", business_partner: "Toko E", invoice_no: "INV-5", kode: "30-09-26-080000" },
];

describe("export detail laporan kolektor", () => {
  it("kolom & urutan: tanggal, kode, BP", () => {
    const r = tukarDetailSheets(done, "2026-10", "");
    expect(r.sheets.map((s) => s.name)).toEqual(["Detail", "Titik Lokasi"]);
    const detail = r.sheets[0].rows;
    expect(detail[0]).toEqual(["Tanggal Tukar", "Business Partner", "No Invoice", "Kolektor", "Kode Unik"]);
    expect(detail.slice(1).map((x) => x[2])).toEqual(["INV-4", "INV-1", "INV-3", "INV-2", ""]);
    expect(detail.at(-1)).toEqual(["2026-10-03", "Toko D", "", "Tanpa Kolektor", "03-10-26-080000"]);
  });
  it("titik lokasi per kode: jumlah BP & invoice; total sama dengan laporan harian", () => {
    const r = tukarDetailSheets(done, "2026-10", "");
    const titik = r.sheets[1].rows;
    expect(titik[2]).toEqual(["02-10-26-101500", "2026-10-02", "Andi", 2, 3]);
    const fromScreen = tukarDays(done, "2026-10", "").days.reduce((s, d) => s + d.lok, 0);
    expect(r.lokasi).toBe(fromScreen);
    expect(r.rows).toBe(tukarDays(done, "2026-10", "").days.reduce((s, d) => s + d.inv, 0));
    expect(titik.at(-2)).toEqual(["Total Titik Lokasi", 3]);
  });
  it("filter kolektor (termasuk Tanpa Kolektor)", () => {
    expect(tukarDetailSheets(done, "2026-10", "Andi").rows).toBe(3);
    expect(tukarDetailSheets(done, "2026-10", "Tanpa Kolektor").lokasi).toBe(1);
    expect(tukarDetailSheets(done, "2026-11", "").rows).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { dailyReport } from "./daily-report";
import { tukarDays } from "./dashboard";

describe("daily collector matrix and export", () => {
  const done = [
    { tanggal_tukar: "2026-10-04", kurir: "A", business_partner: "BP1", kode: "X" },
    { tanggal_tukar: "2026-10-04", kurir: "A", business_partner: "BP1", kode: "X" },
    { tanggal_tukar: "2026-10-05", kurir: "B", business_partner: "BP2", kode: "Y" },
  ];
  it("uses numerical day columns and all Sundays in the selected month", () => {
    const r = dailyReport("2026-10", tukarDays(done, "2026-10", "").days, "");
    expect(r.columns).toHaveLength(31);
    expect(r.columns.filter(c => c.sunday).map(c => c.day)).toEqual([4, 11, 18, 25]);
    expect(r.rows.map(r => r.label)).toEqual(["Invoice", "Business Partner", "Titik Lokasi"]);
  });
  it("keeps filtered totals and exports the same matrix as numbers", () => {
    const r = dailyReport("2026-10", tukarDays(done, "2026-10", "A").days, "A");
    expect(r.rows.map(r => r.total)).toEqual([2, 1, 1]);
    expect(r.activeDays).toBe(1);
    expect(r.excel[2]).toEqual(["Kolektor", "A"]);
    expect(r.excel[5]).toEqual(["Tanggal", ...Array.from({length:31}, (_,i)=>i+1), "Total"]);
    expect(r.excel[6]).toEqual(["Invoice", ...r.rows[0].values, 2]);
    expect(r.rows[0].values[4]).toBe(0);
  });
  it("supports leap years and empty months", () => {
    const r = dailyReport("2024-02", tukarDays([], "2024-02", "").days, "");
    expect(r.columns).toHaveLength(29);
    expect(r.columns.filter(c=>c.sunday).map(c=>c.day)).toEqual([4,11,18,25]);
    expect(r.rows.every(r=>r.total===0)).toBe(true);
  });
});

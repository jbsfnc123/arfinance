import { describe, expect, it } from "vitest";
import { parseNumber } from "./number";
import { daysBetween, excelSerialToISO, parseDate, todayJakarta } from "./date";

describe("parseNumber", () => {
  it.each([
    [1234.5, 1234.5],
    ["1.234.567", 1234567],
    ["1.234", 1234],
    ["1,234,567.89", 1234567.89],
    ["1.234,56", 1234.56],
    ["1,5", 1.5],
    ["2.75", 2.75],
    ["610,500.00 CR", 610500],
    ["(1.500)", -1500],
    ["1.500-", -1500],
    ["-2000", -2000],
    ["Rp 2.000.000", 2000000],
    ["", 0],
    ["-", 0],
    [null, 0],
    ["abc", 0],
  ])("%j → %j", (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });
});

describe("parseDate", () => {
  it.each([
    ["15/09/2026", "2026-09-15"],
    ["5-1-2026", "2026-01-05"],
    ["05.01.26", "2026-01-05"],
    ["2026-09-15", "2026-09-15"],
    ["2026-09-15T10:00:00", "2026-09-15"],
    ["19 Sep , 2026", "2026-09-19"],
    ["1 Agustus 2026", "2026-08-01"],
    ["3 Mei 2026", "2026-05-03"],
    [46280, "2026-09-15"],
    ["46280", "2026-09-15"],
    [150, null],
    ["31/02/2026", null],
    ["", null],
    [null, null],
  ])("%j → %j", (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });

  it("Date lokal dipakai apa adanya (tanpa geser zona)", () => {
    expect(parseDate(new Date(2026, 8, 15))).toBe("2026-09-15");
  });

  it("serial Excel", () => {
    expect(excelSerialToISO(46023)).toBe("2026-01-01");
  });

  it("selisih hari dan hari ini di Jakarta", () => {
    expect(daysBetween("2026-10-01", "2026-09-15")).toBe(16);
    expect(daysBetween("2026-09-15", "2026-09-15")).toBe(0);
    // 18:30 UTC = 01:30 WIB hari berikutnya
    expect(todayJakarta(new Date("2026-09-24T18:30:00Z"))).toBe("2026-09-25");
  });
});

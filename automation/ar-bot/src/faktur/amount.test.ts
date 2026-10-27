import { describe, expect, it } from "vitest";
import { compareAmount, formatAmountCheck, parseAmount, toleranceOf } from "./amount";
import { verifySubInvoice, verifyStatus } from "./po";

describe("pembacaan nominal", () => {
  it.each([
    ["1,804,249.5", 1804249.5],
    ["1.804.249,5", 1804249.5],
    ["Rp 1.804.249", 1804249],
    ["Rp.3,012,540", 3012540],
    ["IDR 1,804,249.50", 1804249.5],
    ["1804249", 1804249],
    [1804249.5, 1804249.5],
    ["(1.000)", -1000],
    ["-1,5", -1.5],
    ["1.804", 1804],
    ["1,5", 1.5],
    ["12.50", 12.5],
    ["Rp 0", 0],
    [" 1.000.000 ", 1000000],
  ])("%s → %s", (input, out) => expect(parseAmount(input)).toBe(out));
  it("kosong / tidak valid → null", () => {
    for (const v of ["", "abc", "Rp", null, undefined, "1.2.3,4,5"]) expect(parseAmount(v)).toBeNull();
  });
  it("toleransi dari pengaturan", () => {
    expect(toleranceOf(undefined)).toBe(100);
    expect(toleranceOf(-5)).toBe(100);
    expect(toleranceOf(0)).toBe(0);
    expect(toleranceOf("250")).toBe(250);
    expect(toleranceOf(5_000_000)).toBe(1_000_000);
  });
});

describe("pencocokan Open Amt", () => {
  it("contoh log user: EDI 1,804,249.5 vs aplikasi 1804249 → selisih 0.5", () => {
    const c = compareAmount("SJ/1", "1,804,249.5", 1804249, 10);
    expect(c).toMatchObject({ ok: true, diff: 0.5 });
    expect(formatAmountCheck(c, 10)).toBe('Open Amt EDI="1,804,249.5" | Aplikasi="1804249" | selisih=0.5 | toleransi=10 → COCOK (SJ SJ/1)');
    expect(formatAmountCheck(compareAmount("", "1.900.000", 1804249, 100), 100)).toContain("selisih=95751 | toleransi=100 → TIDAK COCOK");
    expect(formatAmountCheck(compareAmount("", "-", 1804249, 100), 100)).toContain("selisih=tidak terbaca");
  });
  it("berlaku saat SJ cocok dan saat mencari baris lain yang nominalnya cocok", () => {
    const rows = [{ noSj: "SJ/0001", openAmt: "1,000,000.00" }, { noSj: "SJ/0002", openAmt: "1.804.249,5" }];
    const sj = verifySubInvoice({ no_sj: "SJ/0002", open_amt: 1804249 }, rows, 100);
    expect(sj).toMatchObject({ sjOk: true, amtOk: true });
    expect(sj.checks[0].noSj).toBe("SJ/0002");
    const other = verifySubInvoice({ no_sj: "SJ/9999", open_amt: 1804200 }, rows, 100);
    expect(other).toMatchObject({ sjOk: false, amtOk: true });
    expect(verifyStatus(other)).toBe("Cek Kode Barang");
    expect(verifySubInvoice({ no_sj: "SJ/9999", open_amt: 1804200 }, rows, 0).amtOk).toBe(false);
    expect(verifySubInvoice({ no_sj: "SJ/0002", open_amt: 1804249 }, rows, 0).amtOk).toBe(false); // selisih 0,5 > 0
  });
});

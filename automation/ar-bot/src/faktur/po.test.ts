import { describe, expect, it } from "vitest";
import { applyPo, readPoRows, verifyStatus, verifySubInvoice } from "./po";
import { groupPages, parsePageText } from "./split";
import type { FakturItem } from "./split";

const item = (invoice: string): FakturItem => ({ index: 1, invoice, faktur: "1", filename: "1.pdf", pages: 1, size: 1, checked: true, status: "Ready" });

describe("data PO", () => {
  it("tempel dari Excel (tab) cocok tanpa beda huruf & angka dibersihkan", () => {
    const rows = readPoRows({ text: "Invoice No\tNo PO\tNo SJ\tOpen Amt\ninv-001\tPO123\tSJ-9\t1.250.000\nINV-404\tX\tY\t1" });
    const r = applyPo([item("INV-001"), item("INV-002")], rows);
    expect(r.matched).toBe(1);
    expect(r.items[0]).toMatchObject({ no_po: "PO123", no_sj: "SJ-9", open_amt: 1250000 });
    expect(r.items[1].no_po).toBeUndefined();
  });
  it("tanpa kolom invoice → galat", () => {
    expect(() => applyPo([item("A")], readPoRows({ text: "PO\tSJ\n1\t2" }))).toThrow(/Invoice No/);
  });
});

describe("verifikasi sub-invoice", () => {
  const rows = [{ noSj: "SJ/0001", openAmt: "1.000.000" }, { noSj: "SJ/0002", openAmt: "2.000.000" }];
  it("SJ & nominal cocok (toleransi 500)", () => {
    const v = verifySubInvoice({ no_sj: "0002", open_amt: 2_000_400 }, rows);
    expect(v).toEqual({ sjOk: true, amtOk: true });
    expect(verifyStatus(v)).toBeNull();
  });
  it("status sama dengan bot lama", () => {
    expect(verifyStatus(verifySubInvoice({ no_sj: "0002", open_amt: 2_100_000 }, rows))).toBe("Invoice Selisih");
    expect(verifyStatus(verifySubInvoice({ no_sj: "9999", open_amt: 1_000_000 }, rows))).toBe("Cek Kode Barang");
    expect(verifyStatus(verifySubInvoice({ no_sj: "9999", open_amt: 5 }, rows))).toBe("Data Tidak Cocok");
  });
});

describe("kelompok halaman faktur", () => {
  it("lanjutan halaman & referensi dari halaman berikutnya", () => {
    expect(parsePageText("Kode dan Nomor Seri Faktur Pajak: 0400123\n(Referensi: INV/1)")).toEqual({ faktur: "0400123", ref: "INV/1" });
    const g = groupPages(["Nomor Seri Faktur Pajak: 11\nisi", "lanjutan\nReferensi: INV-A)", "Nomor Seri Faktur Pajak: 22", "tanpa nomor"]);
    expect(g.map((x) => [x.faktur, x.invoice, x.pages])).toEqual([["11", "INV-A", [0, 1]], ["22", "22", [2, 3]]]);
  });
});

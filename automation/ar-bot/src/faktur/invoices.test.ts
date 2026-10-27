import { describe, expect, it } from "vitest";
import { fillStatus, importInvoices, invoiceQueue } from "./invoices";

const head = ["Invoice No", "No PO", "No SJ", "Open Amt"];

describe("Sheet Invoice (Isi No Invoice)", () => {
  it("impor template Excel PO: nominal EDI & Indonesia, baris kosong, invoice ganda", () => {
    const r = importInvoices([
      head,
      ["SI/141272/X/XXVI/TRA", "API2640004000000625", "SJ/177291/XXVI/TRA", "2,177,542.5"],
      ["", "", "", ""],
      ["SI/141274/X/XXVI/TRA", "API2640004000000631", "SJ/177267/XXVI/TRA", "1.604.505"],
      ["", "PO-TANPA-INVOICE", "", ""],
      ["si/141274/x/xxvi/tra", "API2640004000000631", "SJ/177267/XXVI/TRA", "Rp 1.604.506"],
    ]);
    expect(r.skipped).toBe(1);
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toEqual({ invoice: "SI/141272/X/XXVI/TRA", no_po: "API2640004000000625", no_sj: "SJ/177291/XXVI/TRA", open_amt: 2177542.5, checked: true, status: "Ready" });
    expect(r.items[1].open_amt).toBe(1604506);
  });
  it("kolom wajib", () => {
    expect(() => importInvoices([["No PO", "No SJ"], ["PO1", "SJ1"]])).toThrow(/Invoice No/);
    expect(() => importInvoices([["Invoice No", "No SJ"], ["SI/1", "SJ1"]])).toThrow(/No PO/);
    expect(() => importInvoices([head])).toThrow(/kosong/);
  });
  it("antrean: tercentang & belum terisi", () => {
    const base = { no_po: "PO", no_sj: "SJ", open_amt: 1 };
    const q = invoiceQueue([
      { ...base, invoice: "A", checked: true, status: "Ready" },
      { ...base, invoice: "B", checked: false, status: "Ready" },
      { ...base, invoice: "C", checked: true, status: "No Invoice Terisi · INV1 (SJ/1)" },
      { ...base, invoice: "D", checked: true, status: "Cek Kode Barang" },
    ]);
    expect(q.map((i) => i.invoice)).toEqual(["A", "D"]);
  });
  it("status sesudah Save", () => {
    expect(fillStatus("", "INV1 (SJ/1)")).toBe("No Invoice Terisi · INV1 (SJ/1)");
    expect(fillStatus("Berhasil  disimpan", "INV1")).toBe("No Invoice Terisi · INV1");
    expect(fillStatus("Vendor Invoice No sudah dipakai", "INV1")).toBe("Gagal Simpan: Vendor Invoice No sudah dipakai");
  });
});

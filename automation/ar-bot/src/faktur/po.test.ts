import { describe, expect, it } from "vitest";
import { applyPo, docMatches, pickDraftDoc, readPoRows, verifyStatus, verifySubInvoice } from "./po";
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
  it("SJ & nominal cocok (toleransi bawaan 100, bisa diatur)", () => {
    const v = verifySubInvoice({ no_sj: "0002", open_amt: 2_000_050 }, rows);
    expect(v).toMatchObject({ sjOk: true, amtOk: true });
    expect(verifyStatus(v)).toBeNull();
    expect(verifySubInvoice({ no_sj: "0002", open_amt: 2_000_400 }, rows).amtOk).toBe(false);
    expect(verifySubInvoice({ no_sj: "0002", open_amt: 2_000_400 }, rows, 500).amtOk).toBe(true);
  });
  it("Open Amt dari Excel/tempel: format EDI, Indonesia & Rp", () => {
    const r = applyPo([item("A"), item("B"), item("C")], readPoRows({ text: "Invoice No\tOpen Amt\nA\t1,804,249.5\nB\t1.804.249,5\nC\tRp 1.804.249" }));
    expect(r.items.map((i) => i.open_amt)).toEqual([1804249.5, 1804249.5, 1804249]);
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

describe("pilih cepat dari data PO", () => {
  it("invoice yang ada di Excel dicentang, sisanya tidak; baris Excel tanpa faktur dilaporkan", () => {
    const rows = readPoRows({ text: "Invoice No\tNo PO\nINV-1\tPO1\ninv-3\tPO3\nINV-9\tPO9" });
    const r = applyPo([item("INV-1"), item("INV-2"), item("INV-3")], rows, { select: true });
    expect(r.items.map((i) => [i.invoice, i.checked, i.in_po])).toEqual([["INV-1", true, true], ["INV-2", false, false], ["INV-3", true, true]]);
    expect(r).toMatchObject({ matched: 2, excelRows: 3, unmatchedExcel: ["INV-9"], notInPo: 1 });
  });
  it("tanpa select centang tidak berubah", () => {
    const r = applyPo([{ ...item("INV-2"), checked: true }], readPoRows({ text: "Invoice No\nINV-1" }));
    expect(r.items[0].checked).toBe(true);
  });
});

describe("PO dengan beberapa invoice & SJ", () => {
  // Contoh user: PO26000016568 → SI/139545 (SJ/173220) & SI/139546 (SJ/174755), masing-masing dokumen Draft sendiri.
  const docA = { id: "1", docNo: "INV-A", vendorInvoiceNo: "", rows: [{ noSj: "SJ/173220/XXVI/TRA", openAmt: "Rp.1,500,000" }] };
  const docB = { id: "2", docNo: "INV-B", vendorInvoiceNo: "", rows: [{ noSj: "SJ/174755/XXVI/TRA", openAmt: "Rp.2,750,000" }] };
  const si545 = { invoice: "SI/139545/X/XXVI/TRA", no_sj: "SJ/173220/XXVI/TRA", open_amt: 1_500_000 };
  const si546 = { invoice: "SI/139546/X/XXVI/TRA", no_sj: "SJ/174755/XXVI/TRA", open_amt: 2_750_000 };
  it("dokumen dipilih dari No SJ, urutan hasil cari tidak berpengaruh", () => {
    expect(pickDraftDoc(si545, [docA, docB])).toMatchObject({ doc: { id: "1" }, sj: "SJ/173220/XXVI/TRA" });
    expect(pickDraftDoc(si546, [docA, docB])).toMatchObject({ doc: { id: "2" } });
    expect(pickDraftDoc(si546, [docB, docA])).toMatchObject({ doc: { id: "2" } });
  });
  it("dokumen yang sudah berisi invoice lain dilewati; invoice yang sama boleh diproses ulang", () => {
    const usedA = { ...docA, vendorInvoiceNo: "SI/139546/X/XXVI/TRA" };
    expect(pickDraftDoc(si545, [usedA, docB])).toEqual({ doc: null, status: "SJ sudah dipakai invoice SI/139546/X/XXVI/TRA (INV-A)" });
    expect(pickDraftDoc(si545, [{ ...docA, vendorInvoiceNo: "si/139545/x/xxvi/tra" }, docB])).toMatchObject({ doc: { id: "1" } });
    expect(docMatches(si545, usedA)).toBe(false);
    expect(docMatches(si545, docA)).toBe(true);
    expect(docMatches(si546, docA)).toBe(false);
  });
  it("SJ tidak ada / nominal beda", () => {
    expect(pickDraftDoc({ ...si545, no_sj: "SJ/999999", open_amt: 5 }, [docA, docB])).toEqual({ doc: null, status: "SJ Tidak Ditemukan di PO (2 dokumen)" });
    expect(pickDraftDoc({ ...si545, no_sj: "SJ/999999" }, [docA, docB])).toEqual({ doc: null, status: "Cek Kode Barang (2 dokumen PO)" });
    expect(pickDraftDoc({ ...si545, open_amt: 9_000_000 }, [docA, docB])).toEqual({ doc: null, status: "Invoice Selisih (INV-A)" });
  });
  it("satu dokumen → status bot lama", () => {
    expect(pickDraftDoc(si546, [docA])).toEqual({ doc: null, status: "Data Tidak Cocok" });
    expect(pickDraftDoc(si545, [docA])).toMatchObject({ doc: { id: "1" } });
    expect(pickDraftDoc(si545, [])).toEqual({ doc: null, status: "Not Found in Draft (PO)" });
  });
});

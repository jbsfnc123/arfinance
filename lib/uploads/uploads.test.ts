import { describe, expect, it } from "vitest";
import { detectKind, parseAging, parseBpMaster, parseErp } from "./parse";


const d = (y: number, m: number, day: number) => (Date.UTC(y, m - 1, day) - Date.UTC(1899, 11, 30)) / 864e5;

const ERP_HEAD = ["BP Key", "BP Name", "BP Location", "BP Group", "Marketing Group", "Branch", "Credit Limit", "Payment Term",
  "Invoice No.", "Invoice Amount", "Invoice Date", "Due Date", "Payment Document", "Payment Bank Account", "Payment Amount", "Payment Date", "PO No. Customer"];
const report = (from: number, to: number, body: unknown[][]) => [
  ["Organization :", "Penguin"], ["Payment Group", ""], ["Date :", from, "/", to], [], ERP_HEAD, ...body];
const INVOICE_REPORT = report(d(2026, 9, 1), d(2026, 9, 30), [
  ["1000258", "Toko A", "Jakarta", "Toko A -", "Traditional", "Jakarta", 0, "Net 30 Days", "INV1", 1000000, d(2026, 9, 5), d(2026, 10, 5), "P1", "BCA", 400000, d(2026, 10, 1), "PO-1"],
  ["1000258", "Toko A", "Jakarta", "Toko A -", "Traditional", "Jakarta", 0, "Net 30 Days", "INV1", 1000000, d(2026, 9, 5), d(2026, 10, 5), "P2", "BCA", 600000, d(2026, 10, 9), "PO-1"],
  ["2000", "Reseller B", "Medan", "B", "Reseller", "Medan", 0, "C B D", "INV2", 500000, d(2026, 9, 6), d(2026, 9, 6), "P3", "BCA", 500000, d(2026, 9, 6), "-"],
  ["3000", "Toko C", "Bali", "C", "Traditional", "Bali", 0, "Net 7 Days - With Tolerance Days", "INV3", 250000, d(2026, 9, 7), d(2026, 9, 14), "", "", "", "", ""],
]);

// Simulasi isi database setelah erp_commit (invoice = baris pertama, payment per dokumen).

describe("deteksi jenis file", () => {
  it("aging, erp, target, bp master, mutasi", () => {
    expect(detectKind([{ name: "Blank_A4", rows: [["Payment Group", "Collection Name", "Tax Name", "Invoice No", "Due Date", "Open Amt"]] }])).toBe("aging");
    expect(detectKind([{ name: "S", rows: INVOICE_REPORT }])).toBe("erp");
    expect(detectKind([{ name: "S", rows: [["Invoice No.", "Payment Document", "Payment Amount", "Payment Date"]] }])).toBe("erp");
    expect(detectKind([{ name: "S", rows: [[], ["Invoice No", "Open Amt"]] }])).toBe("target");
    expect(detectKind([{ name: "S", rows: [["Search Key", "Name", "PIC AR"]] }])).toBe("bpmaster");
    expect(detectKind([{ name: "MUT_4888", rows: [["Tanggal Transaksi", "Keterangan", "Jumlah"]] }])).toBe("mutasi");
  });
});

describe("parser laporan bersama", () => {
  it("aging: semua baris disimpan (termasuk invoice ganda), bulan dari Invoice Date terakhir", () => {
    const r = parseAging([{ name: "Blank_A4", rows: [
      ["Payment Group", "Marketing ", "Value", "Tax Name", "Invoice No", "Invoice Date", "Due Date", "Open Amt", "No SJ"],
      ["CMSS", "02-Modern Market", "1000258", "null", "SI1", d(2026, 8, 30), d(2026, 9, 30), "1.500.000", "#N/A"],
      ["CMSS", "02-Modern Market", "1000258", "", "SI1", d(2026, 8, 30), d(2026, 9, 30), 1500000, ""],
      ["", "", "", "", "", "", "", "", ""],
    ] }]);
    expect(r.rows).toHaveLength(2);
    expect(r.month).toBe("2026-08");
    expect(r.rows[0]).toMatchObject({ marketing: "02-Modern Market", bp_key: "1000258", tax_name: null, open_amt: 1500000, no_sj: null, invoice_date: "2026-08-30" });
  });

  it("erp: meta periode, jenis invoice vs payment", () => {
    const r = parseErp([{ name: "S", rows: INVOICE_REPORT }]);
    expect(r.meta).toMatchObject({ kind: "invoice", org: "Penguin", dari: "2026-09-01", ke: "2026-09-30" });
    expect(r.invoices).toBe(3);
    expect(r.rows[0]).toMatchObject({ bp_group: "Toko A", po_customer: "PO-1", payment_doc: "P1", payment_amount: 400000 });
    const pay = parseErp([{ name: "S", rows: report(d(2026, 10, 1), d(2026, 10, 31), INVOICE_REPORT.slice(5, 7)) }]);
    expect(pay.meta.kind).toBe("payment");
    expect(parseErp([{ name: "S", rows: [["Invoice No.", "Payment Document", "Payment Amount", "Payment Date"], ["A", "P", 5, d(2026, 9, 2)]] }]).meta.kind).toBe("payment");
  });

  it("bp master", () => {
    expect(parseBpMaster([{ name: "S", rows: [["Search Key", "Name", "PIC AR"], ["1000258-PKP", "A", "X"], ["", "B", ""]] }]).rows).toHaveLength(1);
  });
});


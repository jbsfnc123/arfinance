import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { detectKind, parseAging, parseBpMaster, parseErp, type ErpRow } from "./parse";
import { agingAoa, bpAoa, invoiceAoa, paymentAoa, type LegacyParser } from "./deck";

// Parser Presentasi lama dijalankan apa adanya (sama seperti di browser).
function legacy(): LegacyParser {
  const dir = path.resolve(__dirname, "../../public/presentasi-app/js");
  const ctx = vm.createContext({ console, Date, Math, JSON });
  for (const f of ["core/util.js", "data/parse.js"]) vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx);
  return vm.runInContext("({ parseInvoice_, parsePayment_, parseAging_, parseBpMaster_ })", ctx) as LegacyParser;
}
const P = legacy();
const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

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
function toDb(rows: ErpRow[]) {
  const inv = new Map<string, Record<string, unknown>>();
  const pays: Record<string, unknown>[] = [];
  for (const r of rows) {
    if (!inv.has(r.invoice_no!)) inv.set(r.invoice_no!, { ...r, last_payment_date: null });
    if (r.payment_date) {
      pays.push({ ...inv.get(r.invoice_no!), ...r, payment_amount: r.payment_amount });
      const i = inv.get(r.invoice_no!)!;
      if (!i.last_payment_date || r.payment_date > (i.last_payment_date as string)) i.last_payment_date = r.payment_date;
    }
  }
  return { invoices: [...inv.values()], payments: pays };
}

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

describe("paritas Presentasi: data database = import file langsung", () => {
  const erp = parseErp([{ name: "S", rows: INVOICE_REPORT }]);
  const db = toDb(erp.rows);

  it("invoice (sales, kategori, BP, late days)", () => {
    const direct = P.parseInvoice_(INVOICE_REPORT);
    const fromDb = P.parseInvoice_(invoiceAoa(db.invoices));
    expect(plain(fromDb.series)).toEqual(plain(direct.series));
    expect(plain(fromDb.bp)).toEqual(plain(direct.bp));
    expect(direct.series!["amt_all:0"]["2026-09"]).toBe(1000000);
  });

  it("payment (late days per bulan pembayaran)", () => {
    const payFile = report(d(2026, 10, 1), d(2026, 10, 31), INVOICE_REPORT.slice(5, 7));
    const direct = P.parsePayment_(payFile);
    const fromDb = P.parsePayment_(paymentAoa(db.payments.filter((p) => String(p.payment_date).startsWith("2026-10"))));
    expect(plain(fromDb.series)).toEqual(plain(direct.series));
    expect(plain(fromDb.bp)).toEqual(plain(direct.bp));
  });

  it("aging (open, bucket, bad debt, detail BP)", () => {
    const file = [["Payment Group", "Limit Group", "Marketing", "Collection Name", "Column5", "Sales Name", "Value", "Business Partner",
      "Limit", "Tax Name", "Invoice No", "Invoice Date", "Due Date", "Open Amt", "Branch", "Follow Up"],
      ["PG", "", "01-Traditional", "Andi", "", "Sales", "1000258", "Toko A", "", "", "SI1", d(2026, 8, 1), d(2026, 8, 10), 1000, "Jakarta", "telp"],
      ["PG", "", "01-Traditional", "Andi", "", "Sales", "1000258", "Toko A", "", "", "SI1", d(2026, 8, 1), d(2026, 8, 10), 1000, "Jakarta", ""],
      ["PG", "", "03-Reseller", "Budi", "", "Sales", "2000", "B", "", "", "SI2", d(2026, 3, 1), d(2026, 3, 2), 5000, "Medan", ""],
      ["PG", "", "03-Reseller", "Budi", "", "Sales", "2000", "B", "", "", "SI3", d(2026, 8, 20), d(2026, 9, 20), 700, "Medan", ""]];
    const direct = P.parseAging_(file);
    const lines = parseAging([{ name: "Blank_A4", rows: file }]).rows;
    const fromDb = P.parseAging_(agingAoa(lines));
    expect(plain(fromDb.series)).toEqual(plain(direct.series));
    expect(plain(fromDb.bp)).toEqual(plain(direct.bp));
  });

  it("bp master", () => {
    const file = [["Search Key", "Name", "Payment Group", "PIC AR", "Sales / Agent", "Payment Term", "Marketing Groups", "TypeOfCustomer",
      "Credit Limit", "Credit Status", "Sales Region", "Branch", "Description", "First Sale", "LastSale", "Customer"],
      ["1000258-PKP", "Toko A", "PG", "Rina", "Sales", "Net 30 Days", "Traditional", "Toko", 5000000, "OK", "Jawa", "Jakarta", "x  y", d(2025, 1, 2), d(2026, 9, 1), "Yes"],
      ["2000", "Shop", "PG", "", "", "", "E Commerce", "", 0, "", "", "", "", "", "", "Yes"]];
    const direct = P.parseBpMaster_(file);
    const fromDb = P.parseBpMaster_(bpAoa(parseBpMaster([{ name: "S", rows: file }]).rows));
    expect(plain(fromDb.master)).toEqual(plain(direct.master));
  });
});

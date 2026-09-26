import { describe, expect, it } from "vitest";
import type { AgingLine, Datasets } from "@/lib/local/datasets";
import { coverage, hasTempo, historyPeriod, paymentHistory } from "./payment-history";

const line = (o: Partial<AgingLine>): AgingLine => ({
  line_no: 1, invoice_no: null, payment_group: "PG", marketing: null, collection_name: "Ani", sales_name: null, bp_key: null,
  business_partner: null, tax_name: null, invoice_date: null, due_date: null, open_amt: 0, cur_0_30: 0, cur_31_60: 0,
  due_1_7: 0, due_8_30: 0, due_31_60: 0, due_61_90: 0, due_90: 0, days: null, branch: null, no_po: null, no_sj: null, ...o,
});

const erp: Datasets["erp"] = {
  invoices: [
    { invoice_no: "A1", invoice_date: "2026-05-01", amount: 100, bp_key: "B1", due_date: "2026-06-15", payment_term: "Net 45 Days", bp_name: "Toko A", bp_location: "Bogor" },
    { invoice_no: "A2", invoice_date: "2026-06-01", amount: 200, bp_key: "B1", due_date: "2026-07-01", payment_term: "Net 30 Days - With Tolerance Days", bp_name: "Toko A", bp_location: "Bogor" },
    { invoice_no: "A3", invoice_date: "2026-06-10", amount: 300, bp_key: "B1", due_date: "2026-07-10", payment_term: "Net 30 Days", bp_name: "Toko A", bp_location: "Bogor" },
    { invoice_no: "A4", invoice_date: "2026-07-01", amount: 50, bp_key: "B1", due_date: "2026-08-15", payment_term: "Net 45 Days", bp_name: "Toko A", bp_location: "Bogor" },
    { invoice_no: "C1", invoice_date: "2026-07-01", amount: 999, bp_key: "B2", due_date: "2026-07-01", payment_term: "C B D", bp_name: "Toko CBD", bp_location: null },
    { invoice_no: "D1", invoice_date: "2026-07-01", amount: 80, bp_key: null, due_date: "2026-08-01", payment_term: "Net 7 Days", bp_name: "Toko Tanpa Key", bp_location: "Medan" },
  ],
  payments: [
    { invoice_no: "A1", payment_date: "2026-06-20", amount: 100 },  // +5
    { invoice_no: "A2", payment_date: "2026-08-10", amount: 120 },  // +40 (parsial)
    { invoice_no: "A2", payment_date: "2026-08-31", amount: 80 },   // +61 (parsial kedua)
    { invoice_no: "A3", payment_date: "2026-07-05", amount: 300 },  // −5 (sebelum jatuh tempo)
    { invoice_no: "A4", payment_date: "2026-09-02", amount: 50 },   // di luar periode
    { invoice_no: "A1", payment_date: "2026-05-30", amount: 1 },    // di luar periode
    { invoice_no: "C1", payment_date: "2026-07-20", amount: 999 },  // tanpa tempo
    { invoice_no: "D1", payment_date: "2026-08-03", amount: 80 },   // +2
  ],
};
const aging = [
  line({ bp_key: "B1", business_partner: "Toko A - Bogor", invoice_no: "X1", due_date: "2026-09-01", open_amt: 500 }),
  line({ bp_key: "B1", business_partner: "Toko A - Bogor", invoice_no: "X2", due_date: "2026-10-30", open_amt: 700 }),
];

describe("History Pembayaran BP", () => {
  it("periode = 3 bulan penuh sebelum bulan berjalan (lintas tahun)", () => {
    expect(historyPeriod("2026-09-27")).toEqual({ from: "2026-06-01", to: "2026-08-31", months: ["2026-06", "2026-07", "2026-08"] });
    expect(historyPeriod("2027-01-05")).toEqual({ from: "2026-10-01", to: "2026-12-31", months: ["2026-10", "2026-11", "2026-12"] });
    expect(historyPeriod("2026-03-01").to).toBe("2026-02-28");
  });

  it("tempo = Net N Days (termasuk Tolerance); CBD/Immediate diabaikan", () => {
    expect(["Net 7 Days", "Net 3 Days - With Tolerance Days", "Net 90 Days"].every(hasTempo)).toBe(true);
    expect(["C B D", "Immediate", "", null].some(hasTempo)).toBe(false);
  });

  it("lama = payment − due, 3 terlama, parsial terhitung per transaksi, outstanding & overdue dari aging", () => {
    const rows = paymentHistory(erp, aging, historyPeriod("2026-09-27"), "2026-09-27");
    expect(rows.map((r) => r.bp)).toEqual(["Toko A - Bogor", "Toko Tanpa Key - Medan"]); // CBD tidak ada
    const a = rows[0];
    expect(a.count).toBe(4);
    expect(a.tx.map((t) => [t.invoice_no, t.lama])).toEqual([["A2", 61], ["A2", 40], ["A1", 5], ["A3", -5]]);
    expect(a.top3.map((t) => t.lama)).toEqual([61, 40, 5]);
    expect(a.top3Text).toBe("A2 +61 hr · A2 +40 hr · A1 +5 hr");
    expect(a.maxLama).toBe(61);
    expect(a.paid).toBe(600);
    expect(a.avgLama).toBeCloseTo((61 * 80 + 40 * 120 + 5 * 100 - 5 * 300) / 600, 1);
    expect(a.term).toBe("Net 30 Days - With Tolerance Days"); // term terbanyak
    expect([a.outstanding, a.overdue, a.collection]).toEqual([1200, 500, "Ani"]);
    const d = rows[1];
    expect([d.count, d.maxLama, d.outstanding, d.top3.length]).toEqual([1, 2, 0, 1]);
  });

  it("cakupan data per bulan periode", () => {
    expect(coverage(erp, historyPeriod("2026-09-27"))).toEqual([
      { month: "2026-06", payments: 1 }, { month: "2026-07", payments: 2 }, { month: "2026-08", payments: 3 },
    ]);
  });
});

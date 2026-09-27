import { describe, expect, it } from "vitest";
import { decodeErp } from "./datasets";

const pay = { n: 1, cols: { invoice_no: ["A"], payment_date: ["2026-08-01"], amount: [5] } };

describe("decodeErp", () => {
  it("format kamus → bentuk ErpInvoice lengkap (string kosong = null)", () => {
    const r = decodeErp({
      invoices: { n: 2, cols: { invoice_no: ["A", "B"], invoice_date: ["2026-07-01", "2026-07-02"], amount: [10, 20],
        bp_key: ["K1", "K2"], due_date: ["2026-08-01", null], t: [1, 0], l: [0, 1] } },
      terms: ["", "Net 30 Days"],
      labels: [["Toko A", "Bogor"], ["Toko B", ""]],
      payments: pay,
    });
    expect(r.invoices).toEqual([
      { invoice_no: "A", invoice_date: "2026-07-01", amount: 10, bp_key: "K1", due_date: "2026-08-01", payment_term: "Net 30 Days", bp_name: "Toko A", bp_location: "Bogor" },
      { invoice_no: "B", invoice_date: "2026-07-02", amount: 20, bp_key: "K2", due_date: null, payment_term: null, bp_name: "Toko B", bp_location: null },
    ]);
    expect(r.payments).toEqual([{ invoice_no: "A", payment_date: "2026-08-01", amount: 5 }]);
  });

  it("format lama (kolom teks langsung) tetap terbaca", () => {
    const r = decodeErp({
      invoices: { n: 1, cols: { invoice_no: ["A"], invoice_date: ["2026-07-01"], amount: [10], bp_key: ["K1"], due_date: ["2026-08-01"],
        payment_term: ["Net 7 Days"], bp_name: ["Toko"], bp_location: [null] } },
      payments: pay,
    });
    expect(r.invoices[0]).toMatchObject({ payment_term: "Net 7 Days", bp_name: "Toko", bp_location: null });
  });
});

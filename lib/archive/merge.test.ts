import { describe, expect, it } from "vitest";
import { erpFromPaymentRows, mergeErp, mergeMutations, mergeTargets, paymentCounts } from "./merge";

const pay = (invoice_no: string, payment_date: string, amount: number, inv?: Record<string, unknown>) =>
  ({ id: Math.random(), invoice_no, payment_date, amount, invoice: inv ?? { invoice_no, invoice_date: "2026-05-02", amount: amount * 2, payment_term: "Net 30 Days", bp_key: "BP1" } });

describe("gabung arsip ke dataset", () => {
  it("pembayaran arsip membawa invoice-nya", () => {
    const e = erpFromPaymentRows([pay("A", "2026-06-10", 100), pay("A", "2026-06-20", 50), pay("B", "2026-06-11", 70)]);
    expect(e.payments).toHaveLength(3);
    expect(e.invoices.map((i) => i.invoice_no).sort()).toEqual(["A", "B"]);
    expect(e.invoices[0]).toMatchObject({ payment_term: "Net 30 Days", bp_key: "BP1" });
  });
  it("bulan yang masih ada di Supabase tidak diduplikasi; invoice Supabase menang", () => {
    const base = { invoices: [{ invoice_no: "A", invoice_date: "2026-05-02", amount: 1 }], payments: [{ invoice_no: "A", payment_date: "2026-10-01", amount: 1 }] };
    const extra = erpFromPaymentRows([pay("A", "2026-06-10", 100), pay("C", "2026-10-02", 9)]);
    const m = mergeErp(base, extra);
    expect(m.invoices.find((i) => i.invoice_no === "A")?.amount).toBe(1);
    expect(m.invoices.map((i) => i.invoice_no)).toEqual(["A", "C"]);
    expect(m.payments.map((p) => p.payment_date)).toEqual(["2026-10-01", "2026-06-10"]);
  });
  it("hitung per bulan, target & mutasi", () => {
    expect(paymentCounts([pay("A", "2026-06-10", 1), pay("B", "2026-06-11", 1), pay("C", "2026-07-01", 1)])).toEqual({ "2026-06": 2, "2026-07": 1 });
    expect(mergeTargets([{ month: "2026-10", invoice_no: "X" } as never], [{ month: "2026-10", invoice_no: "Y" }, { month: "2026-09", invoice_no: "Z" }]).map((t) => t.invoice_no)).toEqual(["X", "Z"]);
    expect(mergeMutations([{ id: 1 } as never], [{ id: 1 }, { id: 2 }]).map((m) => m.id)).toEqual([1, 2]);
  });
});

import { describe, expect, it } from "vitest";
import { bpOutstanding, type OpenInvoice } from "./spv-summary";
import { computeSpvSummary } from "./closing-v1/summary";

// Fase 89: kartu Business Partner Outstanding di Dashboard Collection (invoice target bulan terpilih).
const inv = (bp: string, sisa: number, days: number | null, mkt = "Mkt A", coll = "Coll X"): OpenInvoice => ({ bp, mkt, coll, sisa, days });
const LIST = [
  inv("Toko A", 1_000_000, 10), inv("Toko A", 500_000, -3, "Mkt B"),
  inv("Toko B", 3_000_000, -1, "Mkt A", "Coll Y"),
  inv("Toko C", 2_000_000, 40), inv("Toko D", 700_000, null),
];

describe("Business Partner Outstanding", () => {
  it("All: semua BP outstanding, urut outstanding terbesar; overdue = days > 0, lainnya not overdue", () => {
    const r = bpOutstanding(LIST, { mode: "all" });
    expect(r.rows.map((x) => [x.bp, x.outstanding, x.overdue, x.notOverdue, x.count])).toEqual([
      ["Toko B", 3_000_000, 0, 3_000_000, 1], ["Toko C", 2_000_000, 2_000_000, 0, 1],
      ["Toko A", 1_500_000, 1_000_000, 500_000, 2], ["Toko D", 700_000, 0, 700_000, 1],
    ]);
    expect(r.rows.find((x) => x.bp === "Toko A")?.marketing).toBe("Mkt A, Mkt B");
    expect(r.marketingList).toEqual(["Mkt A", "Mkt B"]);
    expect(r.collectionList).toEqual(["Coll X", "Coll Y"]);
  });
  it("Overdue: hanya BP ber-overdue, urut overdue; Not Overdue: urut nilai belum jatuh tempo", () => {
    expect(bpOutstanding(LIST, { mode: "overdue" }).rows.map((x) => x.bp)).toEqual(["Toko C", "Toko A"]);
    expect(bpOutstanding(LIST, { mode: "not" }).rows.map((x) => x.bp)).toEqual(["Toko B", "Toko D", "Toko A"]);
  });
  it("filter Marketing / Collection di tingkat invoice", () => {
    expect(bpOutstanding(LIST, { mode: "all", mkt: "Mkt B" }).rows).toEqual([
      { bp: "Toko A", marketing: "Mkt B", collection: "Coll X", count: 1, outstanding: 500_000, overdue: 0, notOverdue: 500_000 },
    ]);
    expect(bpOutstanding(LIST, { mode: "all", coll: "Coll Y" }).rows.map((x) => x.bp)).toEqual(["Toko B"]);
  });
  it("evaluator v1 mengisi openInvoices dari invoice target belum lunas (tanpa mengubah angka lama)", () => {
    const t = (invoice_no: string, target: number, due: string) => ({ id: 1, month: "2026-11", invoice_no, no_sj: null, business_partner: "Toko A",
      marketing: "Mkt A", collection_name: "Coll X", branch: null, due_date: due, target }) as never;
    const line = (invoice_no: string, open_amt: number) => ({ line_no: 1, invoice_no, open_amt, due_date: null, no_sj: null }) as never;
    const s = computeSpvSummary({ month: "2026-11", today: "2026-11-25", targets: [t("I1", 100, "2026-11-20"), t("I2", 5000, "2026-11-30"), t("I3", 9000, "2026-11-01")],
      ar: [], promises: [], notes: [], lastTagihanUpdate: null, agingAll: [line("I2", 5000), line("I3", 9000)] });
    expect(s.openInvoices).toEqual([
      { bp: "Toko A", mkt: "Mkt A", coll: "Coll X", sisa: 5000, days: -5 },
      { bp: "Toko A", mkt: "Mkt A", coll: "Coll X", sisa: 9000, days: 24 },
    ]);
    expect(s.sisa).toBe(14000);
  });
});

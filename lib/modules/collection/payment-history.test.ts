import { describe, expect, it } from "vitest";
import type { AgingLine, Datasets } from "@/lib/local/datasets";
import { coverage, findTarget, groupHistory, groupOf, hasTempo, historyPeriod, isMarketplace, paymentHistory } from "./payment-history";
import { topRows } from "@/lib/local/table";

const line = (o: Partial<AgingLine>): AgingLine => ({
  line_no: 1, invoice_no: null, payment_group: "PG", marketing: "01-Traditional", collection_name: "Ani", sales_name: null, bp_key: null,
  business_partner: null, tax_name: null, invoice_date: null, due_date: null, open_amt: 0, cur_0_30: 0, cur_31_60: 0,
  due_1_7: 0, due_8_30: 0, due_31_60: 0, due_61_90: 0, due_90: 0, days: null, branch: null, no_po: null, no_sj: null, ...o,
});
const inv = (invoice_no: string, bp_key: string | null, due_date: string, payment_term = "Net 30 Days", bp_name = "X") =>
  ({ invoice_no, invoice_date: "2026-05-01", amount: 0, bp_key, due_date, payment_term, bp_name, bp_location: null });

const erp: Datasets["erp"] = {
  invoices: [
    { invoice_no: "A1", invoice_date: "2026-05-01", amount: 100, bp_key: "B1", due_date: "2026-06-15", payment_term: "Net 45 Days", bp_name: "Toko A", bp_location: "Bogor" },
    { invoice_no: "A2", invoice_date: "2026-06-01", amount: 200, bp_key: "B1", due_date: "2026-07-01", payment_term: "Net 30 Days - With Tolerance Days", bp_name: "Toko A", bp_location: "Bogor" },
    { invoice_no: "A3", invoice_date: "2026-06-10", amount: 300, bp_key: "B1", due_date: "2026-07-10", payment_term: "Net 30 Days", bp_name: "Toko A", bp_location: "Bogor" },
    { invoice_no: "A4", invoice_date: "2026-07-01", amount: 50, bp_key: "B1", due_date: "2026-08-15", payment_term: "Net 45 Days", bp_name: "Toko A", bp_location: "Bogor" },
    { invoice_no: "C1", invoice_date: "2026-07-01", amount: 999, bp_key: "B2", due_date: "2026-07-01", payment_term: "C B D", bp_name: "Toko CBD", bp_location: null },
    { invoice_no: "D1", invoice_date: "2026-07-01", amount: 80, bp_key: null, due_date: "2026-08-01", payment_term: "Net 7 Days", bp_name: "Toko Tanpa Key", bp_location: "Medan" },
    inv("G1", "M1", "2026-07-01"), inv("G2", "M2", "2026-07-01"), inv("S1", "Shopee-123", "2026-07-01", "Net 7 Days", "Shopee-123"),
    inv("T1", "T9", "2026-07-01", "Net 7 Days", "Budi"),
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
    { invoice_no: "G1", payment_date: "2026-07-31", amount: 100 },  // +30 (group GIAS)
    { invoice_no: "G2", payment_date: "2026-07-11", amount: 300 },  // +10 (group GIAS)
    { invoice_no: "S1", payment_date: "2026-07-20", amount: 50 },   // marketplace (diabaikan)
    { invoice_no: "T1", payment_date: "2026-07-05", amount: 70 },   // TikTok di aging (diabaikan)
  ],
};
const aging = [
  line({ bp_key: "B1", business_partner: "Toko A - Bogor", payment_group: "Proyek", marketing: "04-Proyek", invoice_no: "X1", due_date: "2026-09-01", open_amt: 500 }),
  line({ bp_key: "B1", business_partner: "Toko A - Bogor", payment_group: "Proyek", marketing: "04-Proyek", invoice_no: "X2", due_date: "2026-10-30", open_amt: 700 }),
  line({ bp_key: "M1", business_partner: "Gias 1", payment_group: "GIAS", collection_name: "Ani", due_date: "2026-09-01", open_amt: 10 }),
  line({ bp_key: "M2", business_partner: "Gias 2", payment_group: "GIAS", collection_name: "Budi", due_date: "2026-10-01", open_amt: 20 }),
  line({ bp_key: "M3", business_partner: "Gias 3", payment_group: "GIAS", collection_name: "Ani", due_date: "2026-08-01", open_amt: 40 }), // tanpa pembayaran
  line({ bp_key: "T9", business_partner: "Budi", payment_group: "TikTok", marketing: "10-E Commerce", open_amt: 5 }),
];
const P = historyPeriod("2026-09-27"), T = "2026-09-27";

describe("History Pembayaran BP", () => {
  it("periode = 3 bulan penuh sebelum bulan berjalan (lintas tahun)", () => {
    expect(P).toEqual({ from: "2026-06-01", to: "2026-08-31", months: ["2026-06", "2026-07", "2026-08"] });
    expect(historyPeriod("2027-01-05")).toEqual({ from: "2026-10-01", to: "2026-12-31", months: ["2026-10", "2026-11", "2026-12"] });
    expect(historyPeriod("2026-03-01").to).toBe("2026-02-28");
  });

  it("tempo = Net N Days; group = payment group ≠ nama marketing; marketplace dikenali", () => {
    expect(["Net 7 Days", "Net 3 Days - With Tolerance Days", "Net 90 Days"].every(hasTempo)).toBe(true);
    expect(["C B D", "Immediate", "", null].some(hasTempo)).toBe(false);
    expect([groupOf("Proyek", "04-Proyek"), groupOf("traditional", "01-Traditional"), groupOf("End User - Corporate", "07-End User - Corporate"), groupOf("", "x")])
      .toEqual([null, null, null, null]);
    expect([groupOf("GIAS", "01-Traditional"), groupOf("Catur Mitra Sejati Sentosa - Pengu338", "16-Modern Market National")])
      .toEqual(["GIAS", "Catur Mitra Sejati Sentosa - Pengu338"]);
    expect([isMarketplace("TikTok"), isMarketplace("Shopee"), isMarketplace("X", "Shopee-99"), isMarketplace("GIAS", "B1", "Toko")]).toEqual([true, true, true, false]);
  });

  it("mode BP: lama = payment − due, 3 terlama, parsial, per bulan, outstanding dari aging; marketplace & CBD hilang", () => {
    const rows = paymentHistory(erp, aging, P, T);
    expect(rows.map((r) => r.name).sort()).toEqual(["Gias 1", "Gias 2", "Toko A - Bogor", "Toko Tanpa Key - Medan"]);
    const a = rows.find((r) => r.name === "Toko A - Bogor")!;
    expect(a.tx.map((t) => [t.invoice_no, t.lama])).toEqual([["A2", 61], ["A2", 40], ["A1", 5], ["A3", -5]]);
    expect(a.top3Text).toBe("A2 +61 hr · A2 +40 hr · A1 +5 hr");
    expect([a.count, a.paid, a.maxLama, a.group, a.outstanding, a.overdue]).toEqual([4, 600, 61, null, 1200, 500]);
    expect(a.avgLama).toBeCloseTo((61 * 80 + 40 * 120 + 5 * 100 - 5 * 300) / 600, 1);
    expect(a.months.map((m) => [m.month, m.count, m.paid])).toEqual([["2026-06", 1, 100], ["2026-07", 1, 300], ["2026-08", 2, 200]]);
    expect(a.months[1].avgLama).toBe(-5);
    expect(rows[0].avgLama).toBeGreaterThanOrEqual(rows[1].avgLama); // urut rata-rata terlama
  });

  it("mode Group: BP ber-group digabung, outstanding seluruh BP group; BP tanpa group tetap baris BP", () => {
    const g = groupHistory(paymentHistory(erp, aging, P, T), aging, P, T);
    expect(g.map((r) => [r.jenis, r.name]).sort()).toEqual([["BP", "Toko A - Bogor"], ["BP", "Toko Tanpa Key - Medan"], ["Group", "GIAS"]]);
    const gias = g.find((r) => r.jenis === "Group")!;
    expect([gias.bpCount, gias.count, gias.paid, gias.maxLama]).toEqual([2, 2, 400, 30]);
    expect(gias.avgLama).toBeCloseTo((30 * 100 + 10 * 300) / 400, 1);
    expect([gias.outstanding, gias.overdue]).toEqual([70, 50]); // termasuk Gias 3 tanpa pembayaran
    expect(gias.collection).toBe("Ani, Budi");
    expect(gias.top3.map((t) => t.bp)).toEqual(["Gias 1", "Gias 2"]);
    expect(gias.members.map((m) => m.name)).toEqual(["Gias 1", "Gias 2"]);
  });

  it("findTarget dari nama BP Daftar Tagihan; cakupan data per bulan", () => {
    expect(findTarget("Gias 2", aging)).toEqual({ bpKey: "M2", bp: "Gias 2", group: "GIAS", marketplace: false });
    expect(findTarget("Toko A - Bogor", aging)?.group).toBeNull();
    expect(findTarget("Budi", aging)?.marketplace).toBe(true);
    expect(findTarget("Tidak Ada", aging)).toBeNull();
    expect(coverage(erp, P).map((c) => c.payments)).toEqual([1, 6, 3]);
  });

  it("hasOld: transaksi telat > 365 hari (tepat 365 belum); group mewarisi anggota; dikeluarkan dari N teratas", () => {
    const old: Datasets["erp"] = {
      invoices: [inv("O1", "M1", "2025-07-01"), inv("O2", "M2", "2025-06-30"), inv("N1", "B1", "2026-06-01")],
      payments: [
        { invoice_no: "O1", payment_date: "2026-07-01", amount: 10 },  // tepat 365 hari
        { invoice_no: "O2", payment_date: "2026-07-01", amount: 10 },  // 366 hari
        { invoice_no: "N1", payment_date: "2026-06-11", amount: 10 },  // +10
      ],
    };
    const bp = paymentHistory(old, aging, P, T);
    const by = Object.fromEntries(bp.map((r) => [r.name, r.hasOld]));
    expect(by).toEqual({ "Gias 1": false, "Gias 2": true, "Toko A - Bogor": false });
    const g = groupHistory(bp, aging, P, T).find((r) => r.jenis === "Group")!;
    expect(g.hasOld).toBe(true);
    // urutan rata-rata terlama: Gias 2 (366), Gias 1 (365), Toko A (10) → N teratas tanpa hasOld
    expect(topRows(bp, 2, (r) => !r.hasOld).map((r) => r.name)).toEqual(["Gias 1", "Toko A - Bogor"]);
    expect(topRows(bp, 2).map((r) => r.name)).toEqual(["Gias 2", "Gias 1"]);
  });
});

// pack_erp_recent (Fase 35): server hanya mengirim pembayaran sejak awal 3 bulan sebelum bulan berjalan + invoice yang
// dibayar di rentang itu. Hasil History harus identik dengan memakai seluruh ERP.
describe("History dari paket ERP ±4 bulan", () => {
  it("identik dengan ERP penuh", () => {
    const today = "2026-09-15";
    const period = historyPeriod(today);
    const from = period.from; // 1 Juni = awal 3 bulan sebelum September
    expect(from).toBe("2026-06-01");
    const payments = erp.payments.filter((p) => p.payment_date >= from);
    const paid = new Set(payments.map((p) => p.invoice_no));
    const recent: Datasets["erp"] = { invoices: erp.invoices.filter((i) => paid.has(i.invoice_no)), payments };
    expect(recent.payments.length).toBeLessThan(erp.payments.length);
    const full = paymentHistory(erp, aging, period, today);
    const sub = paymentHistory(recent, aging, period, today);
    expect(sub).toEqual(full);
    expect(groupHistory(sub, aging, period, today)).toEqual(groupHistory(full, aging, period, today));
    expect(coverage(recent, period)).toEqual(coverage(erp, period));
  });
});

import { describe, expect, it } from "vitest";
import { allocationOf, pctOf, rpShort } from "./allocation";
import { mutasiRaw } from "./compute";
import { buildMutasi } from "./dashboard";
import type { Datasets, Target } from "@/lib/local/datasets";

const M = "2026-09";
const mut = (tx_date: string, amount: number, excluded = false) =>
  ({ id: 0, account: "BCA", tx_date, amount, keterangan: null, catatan: null, excluded, excluded_note: null });
const inv = (invoice_no: string, invoice_date: string, amount: number) => ({ invoice_no, invoice_date, amount }) as Datasets["erp"]["invoices"][number];
const pay = (invoice_no: string, payment_date: string, amount: number) => ({ invoice_no, payment_date, amount });
const tgt = (invoice_no: string, target: number): Target =>
  ({ month: M, invoice_no, target, marketing: null, collection_name: null, business_partner: null, due_date: null, branch: null });

const mutasi: Datasets["mutasi"] = {
  accounts: [{ code: "BCA", active: true, sort: 1 } as Datasets["mutasi"]["accounts"][number]],
  mutations: [mut("2026-09-02", 600), mut("2026-09-10", 400), mut("2026-09-11", 999, true), mut("2026-08-30", 50)],
};
const erp: Datasets["erp"] = {
  invoices: [inv("SI/S1", "2026-09-01", 700), inv("SI/S2", "2026-09-05", 500), inv("SI/T1", "2026-07-01", 300), inv("SI/O1", "2026-06-01", 90)],
  payments: [pay("si/s1 ", "2026-09-06", 450), pay("SI/S2", "2026-09-20", 150), pay("SI/T1", "2026-09-07", 100),
    pay("SI/T2", "2026-09-08", 50), pay("SI/O1", "2026-09-09", 150), pay("SI/S1", "2026-10-01", 250)],
};
const targets = [tgt("SI/T1", 500), tgt("SI/T2", 250), { ...tgt("SI/X", 999), month: "2026-08" }];

describe("alokasi uang masuk", () => {
  const a = allocationOf({ month: M, mutasi, erp, targets });
  it("4 pos tidak tumpang tindih dan cocok dengan Dashboard Mutasi", () => {
    expect([a.sales, a.inflow, a.target]).toEqual([1200, 1000, 750]);
    expect([a.allocSales, a.allocTarget, a.allocOther, a.unallocated]).toEqual([600, 150, 150, 100]);
    expect(a.allocTarget + a.allocSales + a.allocOther + a.unallocated).toBe(a.inflow);
    expect([a.outstanding, a.targetLeft, a.over]).toEqual([600, 600, 0]);
    const old = buildMutasi(mutasiRaw({ month: M, today: "2026-09-30", mutasi, erp, targets }), "2026-09-30");
    expect([old.total, old.inv, old.target, old.alloc, old.allocT]).toEqual([a.inflow, a.sales, a.target, a.allocTotal, a.allocTarget]);
  });
  it("invoice yang ada di target DAN terbit di bulan M dihitung sebagai target (sekali saja)", () => {
    const b = allocationOf({ month: M, mutasi, erp, targets: [...targets, tgt("SI/S2", 500)] });
    expect([b.allocTarget, b.allocSales]).toEqual([300, 450]);
    expect(b.allocTarget + b.allocSales + b.allocOther).toBe(a.allocTotal);
  });
  it("pembayaran melebihi uang masuk: belum dialokasikan 0, selisih di `over`, persen dari total pembayaran", () => {
    const c = allocationOf({ month: M, mutasi: { ...mutasi, mutations: [mut("2026-09-02", 500)] }, erp, targets });
    expect([c.unallocated, c.over, c.base]).toEqual([0, 400, 900]);
    expect(pctOf(c.allocSales, c.base) + pctOf(c.allocTarget, c.base) + pctOf(c.allocOther, c.base)).toBeCloseTo(100);
  });
  it("bulan tanpa data: semua 0, persen aman", () => {
    const d = allocationOf({ month: "2025-01", mutasi, erp, targets });
    expect([d.inflow, d.sales, d.allocTotal, d.base]).toEqual([0, 0, 0, 0]);
    expect(pctOf(1, 0)).toBe(0);
  });
  it("rupiah ringkas", () => {
    expect([rpShort(1_234_000_000), rpShort(350_500_000), rpShort(12_500), rpShort(0)]).toEqual(["1,2 M", "350,5 jt", "12.500", "0"]);
  });
});

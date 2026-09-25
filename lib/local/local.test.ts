import { describe, expect, it } from "vitest";
import { pack, unpack } from "./pack";
import { tukarDays } from "@/lib/modules/tukar/dashboard";
import { mutasiRaw } from "@/lib/modules/mutasi/compute";

describe("paket kolumnar", () => {
  it("pack ↔ unpack bolak-balik", () => {
    const rows = [{ a: 1, b: "x", c: null }, { a: 2, b: "y", c: "2026-09-01" }];
    const p = pack(rows);
    expect(p).toEqual({ n: 2, cols: { a: [1, 2], b: ["x", "y"], c: [null, "2026-09-01"] } });
    expect(unpack(p)).toEqual(rows);
    expect(unpack({ n: 0, cols: {} })).toEqual([]);
  });
});

describe("dashboard lokal", () => {
  it("tukar faktur per hari: invoice, BP unik, lokasi unik, filter kolektor", () => {
    const done = [
      { tanggal_tukar: "2026-09-01", kurir: "Abdul", business_partner: "A", kode: "L1" },
      { tanggal_tukar: "2026-09-01", kurir: "Abdul", business_partner: "A", kode: "L2" },
      { tanggal_tukar: "2026-09-01", kurir: "", business_partner: "B", kode: "L1" },
      { tanggal_tukar: "2026-08-30", kurir: "Budi", business_partner: "C", kode: null },
    ];
    const r = tukarDays(done, "2026-09", "");
    expect(r.months).toEqual(["2026-09", "2026-08"]);
    expect(r.kurirs).toEqual(["Abdul", "Budi", "Tanpa Kolektor"]);
    expect(r.days).toHaveLength(30);
    expect(r.days[0]).toEqual({ day: 1, inv: 3, bp: 2, lok: 2 });
    expect(tukarDays(done, "2026-09", "Abdul").days[0]).toEqual({ day: 1, inv: 2, bp: 1, lok: 2 });
  });

  it("mutasi: pengecualian manual, allocated in target, invoice create", () => {
    const r = mutasiRaw({
      month: "2026-09", today: "2026-09-25",
      mutasi: {
        accounts: [{ code: "BCA-4888", last4: "4888", sort: 1, active: true }, { code: "BRI-3309", last4: "3309", sort: 4, active: false }],
        mutations: [
          { id: 1, account: "BCA-4888", tx_date: "2026-09-01", amount: 1000, keterangan: null, catatan: null, excluded: false, excluded_note: null },
          { id: 2, account: "BCA-4888", tx_date: "2026-09-01", amount: 500, keterangan: null, catatan: null, excluded: true, excluded_note: "x" },
          { id: 3, account: "BRI-3309", tx_date: "2026-08-01", amount: 9, keterangan: null, catatan: null, excluded: false, excluded_note: null },
        ],
      },
      erp: {
        invoices: [{ invoice_no: "I1", invoice_date: "2026-09-02", amount: 700 }],
        payments: [{ invoice_no: "I1", payment_date: "2026-09-02", amount: 400 }, { invoice_no: "X", payment_date: "2026-09-02", amount: 100 }],
      },
      targets: [{ month: "2026-09", invoice_no: "I1", target: 800, marketing: null, collection_name: null, business_partner: null, due_date: null, branch: null }],
    });
    expect(r.accounts).toEqual(["BCA-4888"]);
    expect(r.days[0]).toMatchObject({ mut: { "BCA-4888": 1000 }, exc: 500, excN: 1 });
    expect(r.days[1]).toMatchObject({ alloc: 500, allocT: 400, inv: 700 });
    expect([r.target, r.targetCount, r.months]).toEqual([800, 1, ["2026-09", "2026-08"]]);
  });
});

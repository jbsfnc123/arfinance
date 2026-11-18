import { describe, expect, it } from "vitest";
import type { TfDone } from "@/lib/local/datasets";
import { breakdown, growth, methodOf, monthlySummary, prepareRows } from "./by-method";

const r = (o: Partial<TfDone>): TfDone => ({
  invoice_no: "X", metode: "Kolektor", tanggal: "2026-11-05", nominal: 1000, business_partner: "Toko A", invoice_date: "2026-11-01",
  collection_name: null, kurir: null, resi: null, kuitansi: null, ...o,
});

const rows = prepareRows([
  r({ invoice_no: "K1", kurir: "Firman", nominal: 1000, invoice_date: "2026-11-01" }),
  r({ invoice_no: "K2", kurir: "Karnadi", nominal: 3000, business_partner: "toko a ", invoice_date: "2026-11-03" }),
  r({ invoice_no: "K3", kurir: "Firman", nominal: null, business_partner: "Toko B", invoice_date: "2026-11-10" }), // TF sebelum invoice → hari null
  r({ invoice_no: "E1", metode: "Ekspedisi", collection_name: "Jakarta", nominal: 500, tanggal: "2026-10-20", invoice_date: "2026-10-10" }),
  r({ invoice_no: "M1", metode: "Kwitansi EDI", nominal: 7000, tanggal: "2026-11-02", business_partner: "Mitra10", invoice_date: null }),
  r({ invoice_no: "W1", metode: "WA", nominal: 200, tanggal: "2026-10-01" }),
]);

describe("Dashboard Tukar Faktur per metode", () => {
  it("memetakan metode", () => {
    expect(["Kolektor", "ekspedisi", "Kwitansi EDI", "WA", "Email", "Sistem", null].map(methodOf))
      .toEqual(["kolektor", "ekspedisi", "edi", "lainnya", "lainnya", "lainnya", "lainnya"]);
    expect(rows.find((x) => x.invoice_no === "W1")!.metode_label).toBe("WA");
    expect(rows.find((x) => x.invoice_no === "M1")!.metode_label).toBe("EDI Mitra10");
  });
  it("ringkasan per bulan TF: jumlah, nominal, tanpa nominal, BP unik, rata-rata hari", () => {
    const s = monthlySummary(rows);
    expect(s.map((m) => m.month)).toEqual(["2026-11", "2026-10"]);
    const nov = s[0];
    expect(nov.by.kolektor).toEqual({ inv: 3, nominal: 4000, noNominal: 1, bp: 2, avgHari: 3 });
    expect(nov.by.edi).toMatchObject({ inv: 1, nominal: 7000, avgHari: null });
    expect(nov.by.ekspedisi.inv).toBe(0);
    expect(nov.total).toMatchObject({ inv: 4, nominal: 11000, noNominal: 1 });
    expect(s[1].by.ekspedisi).toMatchObject({ inv: 1, nominal: 500, avgHari: 10 });
    expect(s[1].by.lainnya).toMatchObject({ inv: 1, nominal: 200 });
  });
  it("rincian per kurir / collection & pertumbuhan", () => {
    expect(breakdown(rows, "kolektor")).toEqual([{ name: "Firman", inv: 2, nominal: 1000 }, { name: "Karnadi", inv: 1, nominal: 3000 }]);
    expect(breakdown(rows, "ekspedisi")).toEqual([{ name: "Jakarta", inv: 1, nominal: 500 }]);
    expect(growth(150, 100)).toBe(0.5);
    expect(growth(150, 0)).toBeNull();
    expect(growth(150, undefined)).toBeNull();
  });
});

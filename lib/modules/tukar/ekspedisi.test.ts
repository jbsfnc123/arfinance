import { describe, expect, it } from "vitest";
import type { AgingLine, Exchange } from "@/lib/local/datasets";
import { ekspedisiRows, resiError, resiHistory } from "./ekspedisi";

const line = (o: Partial<AgingLine>): AgingLine => ({
  line_no: 1, invoice_no: null, payment_group: null, marketing: null, collection_name: null, sales_name: null, bp_key: null,
  business_partner: null, tax_name: null, invoice_date: null, due_date: null, open_amt: 0, cur_0_30: 0, cur_31_60: 0,
  due_1_7: 0, due_8_30: 0, due_31_60: 0, due_61_90: 0, due_90: 0, days: null, branch: null, no_po: null, no_sj: null, ...o,
});
const ex = (id: number, invoice_no: string, metode: string, tanggal: string, o: Partial<Exchange> = {}): Exchange =>
  ({ id, invoice_no, metode, tanggal, keterangan: null, resi: null, foto_path: null, kurir: null, collection_name: null, ...o });

const lines = [
  line({ line_no: 1, invoice_no: "A", business_partner: "BP A", payment_group: "PG1", bp_key: "K1", invoice_date: "2026-09-01", open_amt: 5000 }),
  line({ line_no: 2, invoice_no: "A", business_partner: "BP A", open_amt: 9999 }), // baris ganda → diabaikan
  line({ line_no: 3, invoice_no: "B", business_partner: "BP B", open_amt: 800 }), // open ≤ 1.000 → tidak tampil
  line({ line_no: 4, invoice_no: "C", business_partner: "BP C", open_amt: 2000 }),
  line({ line_no: 5, invoice_no: "D", business_partner: "BP D", open_amt: 3000 }),
];

describe("Ekspedisi: daftar invoice", () => {
  const exchanges = [
    ex(1, "C", "Kolektor", "2026-09-10"),
    ex(2, "C", "Ekspedisi", "2026-09-11", { resi: "R-1" }),
    ex(3, "D", "Ekspedisi", "2026-09-12", { keterangan: "LAMA-9" }), // resi lama di keterangan
  ];
  const rows = ekspedisiRows(lines, exchanges);
  it("invoice unik & open > 1.000", () => {
    expect(rows.map((r) => r.invoice_no)).toEqual(["A", "C", "D"]);
    expect(rows[0]).toMatchObject({ nominal: 5000, payment_group: "PG1", bp_key: "K1", status: "Belum TF", resi: "" });
  });
  it("status mengikuti prioritas metode, resi ekspedisi tetap terbaca", () => {
    expect(rows[1]).toMatchObject({ status: "Sudah TF", metode: "Kolektor", tf_date: "2026-09-10", resi: "R-1" });
    expect(rows[2]).toMatchObject({ status: "Sudah TF", metode: "Ekspedisi", tf_date: "2026-09-12", resi: "LAMA-9" });
  });
});

describe("Ekspedisi: riwayat resi", () => {
  it("dikelompokkan per resi + tanggal, terbaru di atas", () => {
    const h = resiHistory([
      ex(1, "A", "Ekspedisi", "2026-09-01", { resi: "R-1" }),
      ex(2, "C", "Ekspedisi", "2026-09-01", { resi: "R-1" }),
      ex(3, "D", "Ekspedisi", "2026-09-05", { resi: "R-2" }),
      ex(4, "A", "WA", "2026-09-06"),
    ], lines);
    expect(h.map((g) => [g.resi, g.count, g.total, g.ids])).toEqual([["R-2", 1, 3000, [3]], ["R-1", 2, 7000, [1, 2]]]);
    expect(h[1].bps).toBe("BP A, BP C");
  });
});

describe("Ekspedisi: validasi", () => {
  it("resi & tanggal", () => {
    expect(resiError(" ", "2026-09-01", "2026-09-28")).toMatch(/wajib/);
    expect(resiError("x".repeat(61), "2026-09-01", "2026-09-28")).toMatch(/60/);
    expect(resiError("R", "", "2026-09-28")).toMatch(/Tanggal/);
    expect(resiError("R", "2026-09-29", "2026-09-28")).toMatch(/melebihi/);
    expect(resiError("R", "2026-09-28", "2026-09-28")).toBeNull();
  });
});

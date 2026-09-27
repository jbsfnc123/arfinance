import { describe, expect, it } from "vitest";
import type { AgingLine, Exchange } from "@/lib/local/datasets";
import { marketingName, tukarMonths, tukarSummary } from "./summary";

const line = (o: Partial<AgingLine>): AgingLine => ({
  line_no: 1, invoice_no: null, payment_group: null, marketing: null, collection_name: null, sales_name: null, bp_key: null,
  business_partner: null, tax_name: null, invoice_date: null, due_date: null, open_amt: 0, cur_0_30: 0, cur_31_60: 0,
  due_1_7: 0, due_8_30: 0, due_31_60: 0, due_61_90: 0, due_90: 0, days: null, branch: null, no_po: null, no_sj: null, ...o,
});
const ex = (invoice_no: string, tanggal: string | null): Exchange =>
  ({ id: 1, invoice_no, metode: "Kolektor", tanggal, keterangan: null, resi: null, foto_path: null, kurir: null, collection_name: null });

const M10 = "Catur Mitra Sejati Sentosa", RKM = "Anyar Retail Indonesia";
const aging = [
  line({ invoice_no: "MM1", marketing: "02-Modern Market", tax_name: "Toko X", invoice_date: "2026-09-02" }),
  line({ invoice_no: "MM1", marketing: "02-Modern Market", tax_name: "Toko X", invoice_date: "2026-09-02" }), // baris ke-2 (SJ lain)
  line({ invoice_no: "MM2", marketing: "16-Modern Market National", tax_name: "Toko Y", invoice_date: "2026-09-10" }),
  line({ invoice_no: "MM3", marketing: "02-Modern Market", tax_name: "Toko Z", invoice_date: "2026-08-30" }), // bulan lain
  line({ invoice_no: "M10A", marketing: "16-Modern Market National", tax_name: M10, invoice_date: "2026-09-03" }), // Mitra10
  line({ invoice_no: "RKMA", marketing: "02-Modern Market", tax_name: "anyar retail indonesia ", invoice_date: "2026-09-03" }), // RKM
  line({ invoice_no: "P1", marketing: "04-Proyek", tax_name: "PT P", invoice_date: "2026-09-05" }),
  line({ invoice_no: "T1", marketing: "01-Traditional", tax_name: "Toko T", invoice_date: "2026-09-05" }),
];
const exchanges = [ex("MM1", "2026-09-12"), ex("MM1", "2026-09-08"), ex("P1", "2026-09-25"), ex("T1", "2026-09-06"), ex("MM2", null)];
const m10 = [
  { invoice_date: "2026-09-01", tukar_faktur: "Done" as const, lama_tf: 10 },
  { invoice_date: "2026-09-04", tukar_faktur: "Done" as const, lama_tf: 15 },
  { invoice_date: "2026-09-20", tukar_faktur: "Pending" as const, lama_tf: null },
  { invoice_date: "2026-08-20", tukar_faktur: "Done" as const, lama_tf: 30 },
];
const rkm = [{ invoice_date: "2026-09-02", tukar_faktur: "Done" as const, lama_tf: 7 }];

describe("Dashboard Tukar Faktur", () => {
  it("nama marketing tanpa prefix angka", () => {
    expect([marketingName("16-Modern Market National"), marketingName("04-Proyek"), marketingName(null)]).toEqual(["modern market national", "proyek", ""]);
  });

  it("4 baris urut Mitra10, RKM, Modern Market, Proyek; MM di luar Mitra10/RKM; invoice unik; TF pertama", () => {
    const s = tukarSummary({ month: "2026-09", m10, rkm, aging, exchanges, m10Tax: M10, rkmTax: RKM });
    expect(s.map((x) => x.label)).toEqual(["Mitra10", "RKM", "Modern Market", "Proyek"]);
    const [a, b, mm, p] = s;
    expect([a.invoice, a.done, a.pending, a.avgHari]).toEqual([3, 2, 1, 12.5]);
    expect([b.invoice, b.done, b.avgHari]).toEqual([1, 1, 7]);
    expect([mm.invoice, mm.done, mm.avgHari]).toEqual([2, 1, 6]); // MM1 (TF 08/09 − 02/09 = 6) + MM2 (belum)
    expect(mm.pct).toBe(0.5);
    expect([p.invoice, p.done, p.avgHari]).toEqual([1, 1, 20]);
  });

  it("bulan tanpa data → 0 dan rata-rata kosong; daftar bulan", () => {
    const s = tukarSummary({ month: "2026-07", m10, rkm, aging, exchanges, m10Tax: M10, rkmTax: RKM });
    expect(s.map((x) => [x.invoice, x.pct, x.avgHari])).toEqual([[0, null, null], [0, null, null], [0, null, null], [0, null, null]]);
    expect(tukarMonths({ m10, rkm, aging, current: "2026-10" })).toEqual(["2026-10", "2026-09", "2026-08"]);
  });

  it("rincian per kelompok: jumlah baris = invoice, status/tanggal TF, nominal dijumlah per invoice, keterangan", () => {
    const withAmt = [
      line({ invoice_no: "MM1", no_sj: "SJ/1", marketing: "02-Modern Market", tax_name: "Toko X", invoice_date: "2026-09-02", open_amt: 100, business_partner: "Toko X - A", collection_name: "Ani" }),
      line({ invoice_no: "MM1", no_sj: "SJ/2", marketing: "02-Modern Market", tax_name: "Toko X", invoice_date: "2026-09-02", open_amt: 50, business_partner: "Toko X - A", collection_name: "Ani" }),
    ];
    const kk = [
      { invoice_date: "2026-09-01", tukar_faktur: "Done" as const, lama_tf: 10, tf_date: "2026-09-11", business_partner: "M10 A", invoice_no: "SI/1", no_sj: "SJ/9", open_amt: 70, keterangan: "LTKP" },
      { invoice_date: "2026-09-02", tukar_faktur: "Pending" as const, lama_tf: 4, tf_date: "2026-09-06", business_partner: "M10 B", invoice_no: "SI/2", no_sj: "SJ/8", open_amt: 30 },
    ];
    const s = tukarSummary({ month: "2026-09", m10: kk, rkm: [], aging: withAmt, exchanges: [ex("MM1", "2026-09-04")], m10Tax: M10, rkmTax: RKM,
      remarks: new Map([["SJ/1", "Janji bayar"]]) });
    const [a, , mm] = s;
    expect(a.rows.length).toBe(a.invoice);
    expect(a.rows.map((r) => [r.bp, r.status, r.tf_date, r.hari, r.nominal, r.keterangan])).toEqual([
      ["M10 A", "Sudah TF", "2026-09-11", 10, 70, "LTKP"],
      ["M10 B", "Belum TF", null, null, 30, null], // TF belum Done → tanggal & hari tidak ditampilkan
    ]);
    expect(mm.rows).toHaveLength(1);
    expect(mm.rows[0]).toMatchObject({ invoice_no: "MM1", nominal: 150, tf_date: "2026-09-04", hari: 2, status: "Sudah TF", collection: "Ani", keterangan: "Janji bayar" });
  });
});

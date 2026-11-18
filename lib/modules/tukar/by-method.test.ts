import { describe, expect, it } from "vitest";
import type { TfDone } from "@/lib/local/datasets";
import { breakdownStats, insights, methodOf, monthDays, monthlySummary, perDay, prepareRows, projection } from "./by-method";

const r = (o: Partial<TfDone>): TfDone => ({
  invoice_no: "X", metode: "Kolektor", tanggal: "2026-11-05", nominal: 1000, business_partner: "Toko A", invoice_date: "2026-11-01",
  collection_name: null, kurir: null, resi: null, kuitansi: null, ...o,
});

const rows = prepareRows([
  r({ invoice_no: "K1", kurir: "Firman", invoice_date: "2026-11-01" }),
  r({ invoice_no: "K2", kurir: "Karnadi", business_partner: "toko a ", invoice_date: "2026-11-03" }),
  r({ invoice_no: "K3", kurir: "Firman", business_partner: "Toko B", invoice_date: "2026-11-10" }), // TF sebelum invoice → hari null
  r({ invoice_no: "E1", metode: "Ekspedisi", collection_name: "Jakarta", tanggal: "2026-10-20", invoice_date: "2026-10-10" }),
  r({ invoice_no: "M1", metode: "Kwitansi EDI", tanggal: "2026-11-02", business_partner: "Mitra10", invoice_date: "2026-11-01" }),
  r({ invoice_no: "W1", metode: "WA", tanggal: "2026-10-01" }),
]);

describe("Dashboard Tukar Faktur per metode", () => {
  it("memetakan metode", () => {
    expect(["Kolektor", "ekspedisi", "Kwitansi EDI", "WA", "Email", "Sistem", null].map(methodOf))
      .toEqual(["kolektor", "ekspedisi", "edi", "lainnya", "lainnya", "lainnya", "lainnya"]);
    expect(rows.find((x) => x.invoice_no === "W1")!.metode_label).toBe("WA");
    expect(rows.find((x) => x.invoice_no === "M1")!.metode_label).toBe("EDI Mitra10");
  });
  it("ringkasan per bulan TF: jumlah invoice, BP unik, rata-rata hari", () => {
    const s = monthlySummary(rows);
    expect(s.map((m) => m.month)).toEqual(["2026-11", "2026-10"]);
    expect(s[0].by.kolektor).toEqual({ inv: 3, bp: 2, avgHari: 3 });
    expect(s[0].by.edi).toEqual({ inv: 1, bp: 1, avgHari: 1 });
    expect(s[0].by.ekspedisi.inv).toBe(0);
    expect(s[0].total.inv).toBe(4);
    expect(s[1].by.ekspedisi).toMatchObject({ inv: 1, avgHari: 10 });
  });
  it("hari berjalan, laju per hari, perkiraan hanya bulan berjalan", () => {
    expect(monthDays("2026-11", "2026-11-18")).toEqual({ total: 30, elapsed: 18, running: true });
    expect(monthDays("2026-10", "2026-11-18")).toEqual({ total: 31, elapsed: 31, running: false });
    expect(monthDays("2026-02", "2026-11-18").total).toBe(28);
    expect(perDay(3166, "2026-11", "2026-11-18")).toBe(175.9);
    expect(perDay(3100, "2026-10", "2026-11-18")).toBe(100);
    expect(projection(3166, "2026-11", "2026-11-18")).toBe(5277);
    expect(projection(4762, "2026-10", "2026-11-18")).toBeNull();
  });
  it("rincian per kolektor / collection", () => {
    expect(breakdownStats(rows, "kolektor")).toEqual([
      { name: "Firman", inv: 2, share: 2 / 3, bp: 2, avgHari: 4 },
      { name: "Karnadi", inv: 1, share: 1 / 3, bp: 1, avgHari: 2 },
    ]);
    expect(breakdownStats(rows, "ekspedisi")[0]).toMatchObject({ name: "Jakarta", inv: 1, share: 1 });
  });
  it("kesimpulan: jumlah, perkiraan, komposisi, kecepatan, teratas, metode kosong", () => {
    const nov = rows.filter((x) => x.bulan === "2026-11");
    const row = monthlySummary(rows)[0];
    const txt = insights({ month: "2026-11", monthName: "November 2026", row, rows: nov, today: "2026-11-18", methods: ["kolektor", "ekspedisi", "edi"] })
      .map((i) => i.parts.map((p) => p.t).join(""));
    expect(txt[0]).toBe("November 2026 (s/d tanggal 18): 4 invoice sudah tukar faktur dari 3 BP — rata-rata 0,2 invoice per hari.");
    expect(txt[1]).toBe("Perkiraan akhir bulan ±7 invoice bila laju harian tetap.");
    expect(txt[2]).toBe("Komposisi: Kolektor 3 (75%) · EDI Mitra10 1 (25%).");
    expect(txt[3]).toBe("Proses tercepat EDI Mitra10 (rata-rata 1 hari dari invoice), terlama Kolektor (3 hari).");
    expect(txt[4]).toBe("Kolektor teratas: Firman 2 invoice (66,7% porsi kolektor).");
    expect(txt[5]).toBe("Kolektor paling lama memproses: Firman (rata-rata 4 hari); Karnadi 2 hari.");
    expect(txt[6]).toBe("Ekspedisi belum ada tukar faktur pada bulan ini.");
    const okt = insights({ month: "2026-10", monthName: "Oktober 2026", row: monthlySummary(rows)[1], rows: rows.filter((x) => x.bulan === "2026-10"), today: "2026-11-18", methods: ["kolektor", "ekspedisi", "edi"] })
      .map((i) => i.parts.map((p) => p.t).join(""));
    expect(okt[0]).toBe("Oktober 2026: 2 invoice sudah tukar faktur dari 1 BP — rata-rata 0,1 invoice per hari.");
    expect(okt.some((t) => t.startsWith("Perkiraan"))).toBe(false);
  });
});

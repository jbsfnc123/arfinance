import { describe, expect, it } from "vitest";
import { mergeSchedule, parseAgingLookup, parseMasterCsv } from "./schedule";
import { groupJadwal, tukarKpi } from "./dashboard";

function csvLine(send: string, bp: string, inv: string, dateInv: string, sep = ";") {
  const cols = new Array(16).fill("x");
  cols[1] = send; cols[7] = bp; cols[14] = inv; cols[15] = dateInv;
  return cols.join(sep);
}

describe("parseMasterCsv", () => {
  const head = ["Laporan", "", "", "", "Send;Date;hdr", ""]; // baris 1..5, baris ke-5 memakai ';'

  it("mulai baris ke-6, filter tanggal dd/MM/yyyy, invoice pertama menang", () => {
    const text = [
      ...head.slice(0, 5),
      csvLine("25/09/2026", "Toko A", "INV-1", "01/09/2026"),
      csvLine("26/09/2026", "Toko A", "INV-1", "01/09/2026"),
      csvLine("25/09/2026", "Toko B", "INV-2", "2026-09-02"),
      "a;b",
      "",
      csvLine('"25/09/2026"', '"Toko C"', '"INV-3"', '"3/9/2026"'),
    ].join("\r\n");
    const res = parseMasterCsv(text);
    expect(res.delimiter).toBe(";");
    expect(res.rows).toEqual([
      { invoice_no: "INV-1", business_partner: "Toko A", invoice_date: "2026-09-01", send_date: "2026-09-25" },
      { invoice_no: "INV-3", business_partner: "Toko C", invoice_date: "2026-09-03", send_date: "2026-09-25" },
    ]);
    expect(res.skipped).toBe(2);
  });

  it("pemisah koma bila baris ke-5 tidak memakai ';'", () => {
    const text = ["a", "b", "c", "d", "e", csvLine("25/09/2026", "Toko A", "INV-1", "01/09/2026", ",")].join("\n");
    expect(parseMasterCsv(text).rows).toHaveLength(1);
  });
});

describe("aging opsional", () => {
  it("lookup dari header dan penggabungan", () => {
    const map = parseAgingLookup([
      ["Payment Group", "Marketing", "Invoice No", "Open Amt"],
      ["PG A", "01-Traditional", "INV-1", "1.500.000"],
    ]);
    const merged = mergeSchedule(
      [{ invoice_no: "INV-1", business_partner: "A", invoice_date: null, send_date: "2026-09-25" },
       { invoice_no: "INV-9", business_partner: "B", invoice_date: null, send_date: "2026-09-25" }],
      map,
    );
    expect(merged[0]).toMatchObject({ payment_group: "PG A", marketing: "01-Traditional", open_amt: 1500000 });
    expect(merged[1].payment_group).toBeUndefined();
  });
});

describe("dashboard tukar faktur", () => {
  it("total dari nilai harian, rata-rata per hari aktif (0,5 ke atas)", () => {
    const k = tukarKpi([
      { day: 1, inv: 3, bp: 2, lok: 1 },
      { day: 2, inv: 0, bp: 0, lok: 0 },
      { day: 3, inv: 2, bp: 1, lok: 2 },
    ]);
    expect(k).toEqual({ totalInvoice: 5, totalBP: 3, totalLokasi: 3, activeDays: 2, avgInvoice: 3, avgBP: 2, avgLokasi: 2 });
  });

  it("jadwal kolektor per BP", () => {
    const g = groupJadwal([
      { business_partner: "Toko B", invoice_no: "3", invoice_date: null, tukar: false, kolektor: null },
      { business_partner: "Toko A", invoice_no: "1", invoice_date: null, tukar: true, kolektor: "Budi" },
      { business_partner: "Toko A", invoice_no: "2", invoice_date: null, tukar: false, kolektor: null },
    ]);
    expect(g.map((x) => [x.bp, x.done, x.total, x.kolektor])).toEqual([
      ["Toko A", 1, 2, "Budi"],
      ["Toko B", 0, 1, null],
    ]);
  });
});

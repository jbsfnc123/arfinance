import { describe, expect, it } from "vitest";
import { findHeaderRow, parseInvoiceFile, parseMutasiWorkbook, parsePaymentFile } from "./parse";
import { buildMutasi } from "./dashboard";
import { parseDate } from "@/lib/parsers/date";

const ACCOUNTS = [{ code: "BCA-4888", last4: "4888" }, { code: "BCA-0780", last4: "0780" }];

describe("mutasi", () => {
  it("rekening dari baris 'No. rekening', periode, hanya CR, abaikan switching penguin", () => {
    const res = parseMutasiWorkbook([
      {
        name: "Sheet1",
        rows: [
          ["Mutasi"], [], ["No. rekening : 7090334888"], [], ["Periode : 01/09/2026 - 03/09/2026"], [],
          ["Tanggal Transaksi", "Keterangan", "Cabang", "Jumlah", "Saldo", "Catatan"],
          ["01/09/2026", "TRSF  E-BANKING CR  PT A", "0000", "1,000,000.00 CR", "x", "inv 1"],
          ["01/09/2026", "BIAYA ADM", "0000", "10,000.00 DB", "x", ""],
          ["02/09/2026 10:15", "SWITCHING PENGUIN KE 0780", "0000", "5,000.00 CR", "x", ""],
        ],
      },
      { name: "MUT_8875", rows: [["Tanggal Transaksi", "Keterangan", "Jumlah"]] },
    ], ACCOUNTS);
    expect(res.ignored).toEqual(["MUT_8875"]);
    expect(res.sheets[0]).toMatchObject({
      account: "BCA-4888",
      dates: ["2026-09-01", "2026-09-02", "2026-09-03"],
      rows: [{ tx_date: "2026-09-01", amount: 1000000, keterangan: "TRSF E-BANKING CR PT A", catatan: "inv 1" }],
    });
  });

  it("tanpa sheet cocok → error; nama sheet memberi 4 digit", () => {
    expect(() => parseMutasiWorkbook([{ name: "X", rows: [] }], ACCOUNTS)).toThrow(/Tidak ada sheet/);
    const r = parseMutasiWorkbook([{ name: "MUT_0780", rows: [] }], ACCOUNTS);
    expect(r.sheets[0].account).toBe("BCA-0780");
  });

  it("header dicari berdasarkan nama (NormHeader)", () => {
    expect(findHeaderRow([["a"], ["", "INVOICE NO.", "Invoice-Amount", "invoice date"]], ["Invoice No.", "Invoice Amount", "Invoice Date"], 30))
      .toEqual({ row: 1, cols: [1, 2, 3] });
  });

  it("invoice: ganda → pertama; payment: nilai 0 dibuang", () => {
    const inv = parseInvoiceFile([["Invoice No.", "Invoice Amount", "Invoice Date"], ["A", 10, 46266], ["A", 99, 46266], ["", 1, 46266], ["B", "1.500", ""]]);
    expect(inv).toEqual([{ invoice_no: "A", invoice_date: "2026-09-01", amount: 10 }]);
    const pay = parsePaymentFile([["Invoice No.", "Payment Document", "Payment Amount", "Payment Date"], ["A", "P1", 5, "02/09/2026"], ["B", "P2", 0, "02/09/2026"]]);
    expect(pay).toEqual([{ invoice_no: "A", payment_doc: "P1", payment_date: "2026-09-02", amount: 5 }]);
  });

  it("tanggal dengan jam", () => {
    expect(parseDate("02/09/2026 10:15:00")).toBe("2026-09-02");
  });

  it("dashboard: total, realisasi, kumulatif berhenti di hari ini", () => {
    const v = buildMutasi({
      accounts: ["BCA-4888", "BCA-0780"], target: 1000, targetCount: 2, months: [],
      days: [
        { date: "2026-09-01", mut: { "BCA-4888": 100 }, alloc: 50, allocT: 40, inv: 7 },
        { date: "2026-09-02", mut: { "BCA-0780": 30 }, alloc: 0, allocT: 0, inv: 0 },
        { date: "2026-09-03", mut: {}, alloc: 0, allocT: 0, inv: 0 },
      ],
    }, "2026-09-02");
    expect(v).toMatchObject({ total: 130, alloc: 50, allocT: 40, inv: 7, realisasi: 0.04, perAccount: { "BCA-4888": 100, "BCA-0780": 30 } });
    expect(v.daily.map((d) => d.cumTotal)).toEqual([100, 130, null]);
    expect(v.daily[1].cumAccount).toEqual({ "BCA-4888": 100, "BCA-0780": 30 });
  });
});

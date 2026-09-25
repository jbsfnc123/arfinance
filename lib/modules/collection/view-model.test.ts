import { describe, expect, it } from "vitest";
import {
  agingCards, applyExchange, categoryCounts, dueRecap, EMPTY_FILTERS, enrichRow, filterRows,
  groupByBp, optionCounts, type RawRow,
} from "./view-model";

const TODAY = "2026-09-25";

function raw(p: Partial<RawRow>): RawRow {
  return {
    invoice_no: "INV", payment_group: "PG1", marketing: "01-Traditional", collection_name: "Andi",
    business_partner: "Toko A", bp_value: "100", invoice_date: "2026-08-10", due_date: "2026-09-10",
    open_amt: 1000000, no_po: "", no_sj: "", catatan: null, janji_bayar: null, metode_tukar: null,
    tanggal_tukar: null, keterangan: null, resi: null, foto_path: null, ...p,
  };
}

const rows = [
  raw({ invoice_no: "A", due_date: "2026-09-30", catatan: "[Case] - retur" }),
  raw({ invoice_no: "B", due_date: "2026-09-10", janji_bayar: "2026-10-01", catatan: "[Reminder]", metode_tukar: "WA" }),
  raw({ invoice_no: "C", due_date: "2026-07-01", business_partner: "Toko B", payment_group: "PG2", metode_tukar: "Ekspedisi", resi: "R1" }),
  raw({ invoice_no: "D", due_date: null, invoice_date: null }),
].map((r) => enrichRow(r, TODAY));

describe("view-model Collection", () => {
  it("aging dihitung saat tampil", () => {
    expect(rows.map((r) => r.aging)).toEqual(["Belum Jatuh Tempo", "1-30 Hari", ">60 Hari", "-"]);
  });

  it("kartu aging + Sudah Jatuh Tempo", () => {
    const c = agingCards(rows);
    expect(c["Sudah Jatuh Tempo"]).toEqual({ count: 2, nominal: 2000000 });
    expect(c["Belum Jatuh Tempo"].count).toBe(1);
  });

  it("filter kategori, aging, BP, dan pencarian", () => {
    expect(filterRows(rows, { ...EMPTY_FILTERS, category: "Case" }).map((r) => r.invoice_no)).toEqual(["A"]);
    expect(filterRows(rows, { ...EMPTY_FILTERS, category: "Janji Bayar" }).map((r) => r.invoice_no)).toEqual(["B"]);
    expect(filterRows(rows, { ...EMPTY_FILTERS, category: "Tidak Ada Catatan" }).map((r) => r.invoice_no)).toEqual(["C", "D"]);
    expect(filterRows(rows, { ...EMPTY_FILTERS, aging: "Sudah Jatuh Tempo" }).map((r) => r.invoice_no)).toEqual(["B", "C"]);
    expect(filterRows(rows, { ...EMPTY_FILTERS, search: "toko b" }).map((r) => r.invoice_no)).toEqual(["C"]);
    expect(filterRows(rows, { ...EMPTY_FILTERS, dateFrom: "2026-08-01" }).map((r) => r.invoice_no)).toEqual(["A", "B", "C"]);
  });

  it("opsi dropdown mengabaikan filternya sendiri", () => {
    const f = { ...EMPTY_FILTERS, pg: "PG2" };
    expect(optionCounts(rows, f, "pg")).toEqual([["PG1", 3], ["PG2", 1]]);
    expect(optionCounts(rows, f, "bp")).toEqual([["Toko B", 1]]);
  });

  it("rekap jatuh tempo, tanpa tanggal paling bawah", () => {
    expect(dueRecap(rows).months.map((m) => m.key)).toEqual(["2026-09", "2026-07", "__KOSONG__"]);
  });

  it("kartu kategori (Janji Bayar tumpang tindih)", () => {
    const c = categoryCounts(rows);
    expect(c["Janji Bayar"].count).toBe(1);
    expect(c["Reminder"].count).toBe(1);
    expect(c["Tidak Ada Catatan"].count).toBe(2);
  });

  it("tukar faktur realtime mengikuti prioritas sumber", () => {
    const b = rows[1]; // WA
    const ex = { tanggal: "2026-09-20", keterangan: null, resi: null, foto_path: null };
    expect(applyExchange(b, { ...ex, metode: "Email" }).metode_tukar).toBe("WA");
    expect(applyExchange(b, { ...ex, metode: "Kolektor" }).metode_tukar).toBe("Kolektor");
    expect(applyExchange(rows[3], { ...ex, metode: "Email" }).metode_tukar).toBe("Email");
  });

  it("kelompok per BP untuk print/export", () => {
    const g = groupByBp([rows[2], rows[0], rows[1]]);
    expect(g.map((x) => [x.bp, x.items.map((r) => r.invoice_no), x.subtotal])).toEqual([
      ["Toko A", ["A", "B"], 2000000],
      ["Toko B", ["C"], 1000000],
    ]);
  });
});

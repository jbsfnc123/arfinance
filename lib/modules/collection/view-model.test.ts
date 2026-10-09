import { describe, expect, it } from "vitest";
import {
  agingCards, applyExchange, categoryCounts, dueRecap, EMPTY_FILTERS, enrichRow, filterRows,
  groupByBp, optionCounts, sortRows, type RawRow, receiveSjOf, withReceive, DEFAULT_COLUMNS, cellText,
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
    expect(filterRows(rows, { ...EMPTY_FILTERS, category: "Jadwal Bayar" }).map((r) => r.invoice_no)).toEqual(["B"]);
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

  it("kartu kategori (Jadwal Bayar tumpang tindih)", () => {
    const c = categoryCounts(rows);
    expect(c["Jadwal Bayar"].count).toBe(1);
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

describe("urut dari header Daftar Tagihan", () => {
  const data = [
    raw({ invoice_no: "A", open_amt: 500, due_date: "2026-09-30", business_partner: "Toko B" }),
    raw({ invoice_no: "B", open_amt: 2000, due_date: "2026-09-10", business_partner: "toko a" }),
    raw({ invoice_no: "C", open_amt: 900, due_date: "2026-07-01", business_partner: "Toko C" }),
    raw({ invoice_no: "D", open_amt: 900, due_date: null, business_partner: "" }),
  ].map((r) => enrichRow(r, TODAY));
  const ids = (rs: typeof data) => rs.map((r) => r.invoice_no).join("");

  it("tanpa urut = urutan asli (objek sama)", () => {
    expect(sortRows(data, null)).toBe(data);
  });
  it("Nominal angka naik/turun; nilai sama tetap urutan asli", () => {
    expect(ids(sortRows(data, { k: "open_amt", dir: 1 }))).toBe("ACDB");
    expect(ids(sortRows(data, { k: "open_amt", dir: -1 }))).toBe("BCDA");
  });
  it("Aging berdasarkan hari lewat jatuh tempo, kosong selalu di akhir", () => {
    expect(ids(sortRows(data, { k: "aging", dir: 1 }))).toBe("ABCD");
    expect(ids(sortRows(data, { k: "aging", dir: -1 }))).toBe("CBAD");
  });
  it("tanggal & teks (kosong di akhir, tanpa beda kapital)", () => {
    expect(ids(sortRows(data, { k: "due_date", dir: 1 }))).toBe("CBAD");
    expect(ids(sortRows(data, { k: "business_partner", dir: 1 }))).toBe("BACD");
    expect(ids(sortRows(data, { k: "business_partner", dir: -1 }))).toBe("CABD");
  });
  it("tidak mengubah array asal", () => {
    const before = ids(data);
    sortRows(data, { k: "open_amt", dir: -1 });
    expect(ids(data)).toBe(before);
  });
});

describe("Receive Date SJ (Monitor Surat Jalan) & kolom default", () => {
  const rec = new Map([["SJ/1/XXVI/TRA", "2026-09-05"], ["SJ/2/XXVI/TRA", "2026-09-09"], ["MR/9/XXVI/TRA", "2026-09-01"]]);
  it("SJ tunggal, gabungan lengkap → tanggal terakhir; gabungan sebagian → ditandai; belum ada → kosong", () => {
    expect(receiveSjOf("sj/1/xxvi/tra", rec)).toEqual({ text: "05/09/2026", date: "2026-09-05" });
    expect(receiveSjOf("SJ/1/XXVI/TRA-SJ/2/XXVI/TRA", rec)).toEqual({ text: "09/09/2026", date: "2026-09-09" });
    expect(receiveSjOf("SJ/2/XXVI/TRA-SJ/3/XXVI/TRA-", rec)).toEqual({ text: "09/09/2026 (sebagian 1/2)", date: "2026-09-09" });
    expect(receiveSjOf("SJ/7/XXVI/TRA", rec)).toEqual({ text: "", date: null });
    expect(receiveSjOf("", rec)).toEqual({ text: "", date: null });
    expect(receiveSjOf("MR/9/XXVI/TRA", rec).date).toBe("2026-09-01");
  });
  it("withReceive mengisi kolom, ikut pencarian & urut sebagai tanggal", () => {
    const rs = withReceive([raw({ invoice_no: "X", no_sj: "SJ/2/XXVI/TRA" }), raw({ invoice_no: "Y", no_sj: "SJ/1/XXVI/TRA" }), raw({ invoice_no: "Z" })].map((r) => enrichRow(r, TODAY)), rec);
    expect(rs.map((r) => cellText(r, "receive_sj"))).toEqual(["09/09/2026", "05/09/2026", ""]);
    expect(rs[0].search).toContain("09/09/2026");
    expect(sortRows(rs, { k: "receive_sj", dir: 1 }).map((r) => r.invoice_no)).toEqual(["Y", "X", "Z"]);
  });
  it("kolom default sesuai permintaan user", () => {
    expect(DEFAULT_COLUMNS).toEqual(["business_partner", "invoice_no", "invoice_date", "due_date", "open_amt", "keterangan", "tanggal_tukar"]);
  });
});

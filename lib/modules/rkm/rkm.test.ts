import { describe, expect, it } from "vitest";
import { parseRkmGr, parseRkmKw } from "./parse";
import { cabangOf, computeRkm, rkmAgingLines } from "./compute";
import type { AgingLine, RkmGr, RkmKw, RkmWorksheet } from "@/lib/local/datasets";

// Data tiruan dengan header persis template portal RKM (tanpa data asli).
const GR_HEAD = ["No", "No. GRPO", "No. Pengiriman", "Tanggal GRPO", "Jumlah GRPO/GRN", "No. Faktur Pajak", "Tanggal Pajak",
  "Jumlah", "Selisih", "Cabang", "No. PO", "Jumlah GRPO", "No. GRN", "Jumlah GRN"];
const KW_HEAD = ["No", "No. GRPO", "Tanggal GRPO", "Cabang", "No. Pengiriman", "No. PO", "Jumlah GRPO", "No. GRN", "Total GRN",
  "Total (GRPO-GRN)", "Tgl. Faktur Pajak", "No. Faktur Pajak", "Jumlah Faktur Pajak", "Selisih", "Pembuat", "Tanggal Input"];

describe("parser RKM", () => {
  it("GR: header per nama, '-' kosong, tanggal dd/mm/yyyy, SJ kapital", () => {
    const rows = parseRkmGr([GR_HEAD, ["1", "900001", "sj/100/XXVI/TRA", "24/09/2026", "1500", "-", "-", "-", "-", "RKM A", "-", "1500", "0", "0"], []]);
    expect(rows).toEqual([{
      no: "1", grpo_no: "900001", no_sj: "SJ/100/XXVI/TRA", tgl_grpo: "2026-09-24", jumlah_grpo_grn: 1500, no_faktur_pajak: null,
      tgl_pajak: null, jumlah: null, selisih: null, cabang: "RKM A", no_po: null, jumlah_grpo: 1500, no_grn: "0", jumlah_grn: 0,
    }]);
  });

  it("Kwitansi: kolom faktur pajak, pembuat, tanggal input", () => {
    const [r] = parseRkmKw([["Laporan"], KW_HEAD,
      ["1", "900002", "23/09/2026", "RKM B", "SJ/200/XXVI/TRA", "-", "2000", "0", "0", "2000", "22/09/2026", "0400001", "2000", "0", "VL01", "24/09/2026"]]);
    expect(r).toMatchObject({ grpo_no: "900002", no_sj: "SJ/200/XXVI/TRA", total_grpo_grn: 2000, tgl_faktur_pajak: "2026-09-22",
      no_faktur_pajak: "0400001", jumlah_faktur_pajak: 2000, pembuat: "VL01", tanggal_input: "2026-09-24" });
  });

  it("menolak file yang bukan template", () => {
    expect(() => parseRkmGr([["Invoice No", "Total"]])).toThrow(/Bukan file GR RKM/);
    expect(() => parseRkmKw([GR_HEAD])).toThrow(/jumlah faktur pajak/);
  });
});

const aging = (p: Partial<AgingLine>): AgingLine => ({
  line_no: 1, invoice_no: null, payment_group: "RKM", marketing: null, collection_name: null, sales_name: null, bp_key: null,
  business_partner: null, tax_name: "Anyar Retail Indonesia", invoice_date: null, due_date: null, open_amt: 0, cur_0_30: 0,
  cur_31_60: 0, due_1_7: 0, due_8_30: 0, due_31_60: 0, due_61_90: 0, due_90: 0, days: null, branch: null, no_po: null, no_sj: null, ...p,
});
const ws = (p: Partial<RkmWorksheet>): RkmWorksheet => ({ id: 1, business_partner: null, invoice_no: null, invoice_date: null,
  due_date: null, open_amt: 0, branch: null, no_po: null, no_sj: "", ...p });
const kw = (p: Partial<RkmKw>): RkmKw => ({ id: 1, no: null, grpo_no: null, tgl_grpo: null, cabang: null, no_sj: null, no_po: null,
  jumlah_grpo: null, no_grn: null, total_grn: null, total_grpo_grn: null, tgl_faktur_pajak: null, no_faktur_pajak: null,
  jumlah_faktur_pajak: null, selisih: null, pembuat: null, tanggal_input: null, ...p });
const gr = (p: Partial<RkmGr>): RkmGr => ({ id: 1, no: null, grpo_no: null, no_sj: null, tgl_grpo: null, jumlah_grpo_grn: null,
  no_faktur_pajak: null, tgl_pajak: null, jumlah: null, selisih: null, cabang: null, no_po: null, jumlah_grpo: null, no_grn: null, jumlah_grn: null, ...p });

describe("hitungan RKM", () => {
  it("cabang dari BP & filter tax name tanpa beda kapital", () => {
    expect(cabangOf("Anyar Retail Indonesia - RKM Cibabat")).toBe("RKM Cibabat");
    expect(cabangOf(null)).toBe("kosong");
    expect(rkmAgingLines([aging({ tax_name: "ANYAR RETAIL INDONESIA " }), aging({ tax_name: "Lain" })], "Anyar Retail Indonesia")).toHaveLength(1);
  });

  it("GR/TF Done, selisih, Lunas, SJ gabungan, lama TF", () => {
    const c = computeRkm({
      worksheet: [
        ws({ id: 1, invoice_no: "I1", invoice_date: "2026-09-01", open_amt: 1000, no_sj: "SJ/1/X/TRA", business_partner: "A - RKM A" }),
        ws({ id: 2, invoice_no: "I2", open_amt: 500, no_sj: "SJ/2/X/TRA-SJ/3/X/TRA" }),
        ws({ id: 3, invoice_no: "I3", open_amt: 700, no_sj: "SJ/4/X/TRA" }),
      ],
      gr: [gr({ no_sj: "SJ/3/X/TRA" }), gr({ id: 2, no_sj: "SJ/9/X/TRA" })],
      kwitansi: [kw({ no_sj: "sj/1/x/tra", jumlah_faktur_pajak: 900, tanggal_input: "2026-09-11", no_faktur_pajak: "FP1" })],
      aging: [aging({ invoice_no: "I1", no_sj: "SJ/1/X/TRA", open_amt: 1000 }), aging({ invoice_no: "I2", no_sj: "SJ/2/X/TRA-SJ/3/X/TRA", open_amt: 500 })],
      remarks: new Map([["SJ/4/X/TRA", "LTKP"]]),
    });
    const [a, b, d] = c.worksheet;
    expect(a).toMatchObject({ cabang: "RKM A", gr: "Done", tukar_faktur: "Done", selisih: 100, status: "Outstanding", lama_tf: 10, no_faktur_pajak: "FP1" });
    expect(b).toMatchObject({ gr: "Done", tukar_faktur: "Pending", selisih: 500, status: "Outstanding" });
    expect(d).toMatchObject({ gr: "Pending", tukar_faktur: "Pending", status: "Lunas", keterangan: "LTKP" });
    expect(c.gr.map((g) => g.check_status)).toEqual(["Done", "Check"]);
    expect(c.gr[0].aging_open).toBe(500);
    expect(c.kwitansi[0]).toMatchObject({ aging: 1000, selisih_aging: -100 });
  });
});

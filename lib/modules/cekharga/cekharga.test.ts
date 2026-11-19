import { describe, expect, it } from "vitest";
import { aggregatePo, parseCsv, parseSo, poClean, reconcile, soPivotLocal, type SoRow } from "./cekharga";

describe("parseSo", () => {
  const header = ["Error Msg", "Document No", "Date PO", "no_po", "Business Partner ", "Price List", "Document Status", "Grand Total"];

  it("mengenali alias header, filter prefix BP & status, format tanggal", () => {
    const rows = parseSo([
      header,
      ["", "SO-1", 46280, "PO1", "Mitra10 Jakarta", "PL", "Completed", "1.500.000"],
      ["", "SO-2", "2026-09-16", "PO2", "RKM Bekasi", "PL", "Completed", 2000],
      ["", "SO-3", 46280, "PO3", "Lain", "PL", "Completed", 1],
      ["", "SO-4", 46280, "PO4", "mitra10 x", "PL", "Draft", 1],
      [],
    ], { partnerPrefixes: "Mitra10, rkm", status: "completed" });
    expect(rows.map((r) => [r.document_no, r.date_po, r.no_po_customer, r.grand_total])).toEqual([
      ["SO-1", "15/09/2026", "PO1", 1500000],
      ["SO-2", "16/09/2026", "PO2", 2000],
    ]);
  });

  it("gagal jelas bila kolom wajib hilang", () => {
    expect(() => parseSo([["Document No"]], { partnerPrefixes: "", status: "" })).toThrow(/Date PO.*No PO Customer \(atau: no po, nopo\)/);
  });
});

describe("PO", () => {
  it("CSV: quote, koma dalam quote, escape, pemisah ;", () => {
    expect(parseCsv('a;"b;c";"d""e"\r\n1;2;3')).toEqual([["a", "b;c", 'd"e'], ["1", "2", "3"]]);
  });

  it("agregasi per No PO (huruf besar), header dilewati, dibulatkan", () => {
    const row = (po: string, total: unknown) => { const r: unknown[] = new Array(21).fill(""); r[0] = po; r[20] = total; return r; };
    const pivot = aggregatePo([[["hdr"], row("po1", "1.000,4"), row("PO1", 500)], [["hdr"], row("PO2", 10), row("", 99)]], "MITRA10");
    expect([...pivot.entries()]).toEqual([["PO1", 1500], ["PO2", 10]]);
  });
});

describe("reconcile", () => {
  it("status & urutan: Selisih, SO tidak ditemukan, OK", () => {
    const rows = reconcile(
      new Map([["PO-OK", 1000], ["PO-X", 500], ["PO-S", 1500]]),
      [
        { po: "PO-OK", total: 999.5, document_no: "SO1", date_po: "", business_partner: "", price_list: "", document_status: "", is_manual: false },
        { po: "PO-S", total: 1000, document_no: "SO2", date_po: "", business_partner: "", price_list: "", document_status: "", is_manual: true },
      ],
    );
    expect(rows.map((r) => [r.po_customer, r.status, r.selisih, r.is_manual])).toEqual([
      ["PO-S", "SELISIH", 500, true],
      ["PO-X", "NOT_FOUND", 0, false],
      ["PO-OK", "OK", 0.5, false],
    ]);
  });
});

describe("pivot SO lokal (Fase 83)", () => {
  const so = (o: Partial<SoRow>): SoRow => ({ document_no: "SO", date_po: "01/11/2026", no_po_customer: "", business_partner: "BP", price_list: "PL", document_status: "Completed", grand_total: 0, ...o });
  const rows = [
    so({ document_no: "SO-1", no_po_customer: " po-a ", grand_total: 1000 }),
    so({ document_no: "SO-2", no_po_customer: "PO-A-REV1", grand_total: 500, business_partner: "Lain" }),
    so({ document_no: "SO-3", no_po_customer: "PO-B", grand_total: 2000 }),
    so({ document_no: "SO-4", no_po_customer: "PO-C", grand_total: 300 }),
    so({ document_no: "SO-5", no_po_customer: "  ", grand_total: 999 }),
  ];
  it("-REV digabung ke PO asal, total dijumlah, data dari baris pertama, PO kosong diabaikan", () => {
    expect(poClean("po-x-rev12")).toBe("PO-X");
    const p = soPivotLocal(rows);
    expect(p.map((x) => [x.po, x.total, x.document_no, x.business_partner, x.is_manual])).toEqual([
      ["PO-A", 1500, "SO-1", "BP", true], ["PO-B", 2000, "SO-3", "BP", false], ["PO-C", 300, "SO-4", "BP", false],
    ]);
  });
  it("rekonsiliasi lokal: selisih, OK, SO tidak ditemukan", () => {
    const po = aggregatePo([[["PO", ...Array(19).fill(""), "Total"], ["po-a", ...Array(19).fill(""), "1.400"], ["PO-B", ...Array(19).fill(""), "2000"], ["PO-Z", ...Array(19).fill(""), "10"]]], "MITRA10");
    const r = reconcile(po, soPivotLocal(rows));
    expect(r.map((x) => [x.po_customer, x.status, x.selisih])).toEqual([["PO-A", "SELISIH", -100], ["PO-Z", "NOT_FOUND", 0], ["PO-B", "OK", 0]]);
  });
});

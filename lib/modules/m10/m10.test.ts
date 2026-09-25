import { describe, expect, it } from "vitest";
import { cleanSj, parseBpUsers, parseGrCsv, parseKwCsv, parseSchedule, toRoman } from "./parse";

describe("mitra10", () => {
  it("CleanSJ: digit, padding 5, tahun romawi", () => {
    expect(toRoman(26)).toBe("XXVI");
    expect(cleanSj("SJ-102301-XXVI-TRA", 2026)).toBe("SJ/102301/XXVI/TRA");
    expect(cleanSj("123", 2026)).toBe("SJ/00123/XXVI/TRA");
    expect(cleanSj("abc", 2026)).toBe("");
  });

  it("GR CSV: kutip dibuang, SJ NO dibentuk, duplikat GR No + Item Code dibuang", () => {
    const csv = [
      '"No";"Store No";"Delivery To";"GR No";"GR Date";"PO No";"PO Date";"Vendor Ship No";"Item Code";"Item Name";UOM;"Qty Order";"Qty Recevied";Status',
      '1;10003;"MITRA10 CIBUBUR";PRC1;2026.07.20;PS1;2026.06.29;SJ-102301-XXVI-TRA;300002272;"J/PENGUIN";PCS;1;1;"PFI CREATED"',
      '2;10003;"MITRA10 CIBUBUR";prc1;2026.07.20;PS1;2026.06.29;SJ-102301-XXVI-TRA;300002272;"J/PENGUIN";PCS;1;1;"PFI CREATED"',
      "",
    ].join("\r\n");
    const r = parseGrCsv(csv, 2026);
    expect(r.lines).toBe(2);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ delivery_to: "MITRA10 CIBUBUR", gr_no: "PRC1", item_code: "300002272", qty_order: 1, status: "PFI CREATED", sj_no: "SJ/102301/XXVI/TRA" });
  });

  it("kwitansi CSV: minimal 11 kolom, Invoice No = kolom 2, duplikat dalam file dilewati", () => {
    const csv = [
      "No;Invoice No;Vendor Invoice No;Invoice Date;Kuitansi No;Kuitansi Date;Accepted Date;PFI No;GR No;PO No;Total Net",
      "1;INV1;SI/1;2026-07-03;M1;08/07/2026;08/07/2026;PFI1;GR1;PO1;1088769",
      "2;inv1;SI/1;2026-07-03;M1;08/07/2026;08/07/2026;PFI1;GR1;PO1;1",
      "3;INV2;SI/2;2026-07-03",
    ].join("\n");
    const r = parseKwCsv(csv);
    expect(r.dupInFile).toBe(1);
    expect(r.rows).toEqual([{ invoice_no: "INV1", vendor_invoice_no: "SI/1", invoice_date: "2026-07-03", kuitansi_no: "M1", kuitansi_date: "2026-07-08", accepted_date: "2026-07-08", pfi_no: "PFI1", gr_no: "GR1", po_no: "PO1", total_net: 1088769 }]);
  });

  it("jadwal bayar & username", () => {
    expect(parseSchedule([["NO KW", "SPP", "NILAI KW", "TGL TUKAR FAKTUR", "JADWAL TRANSFER", "Notes"], ["M1", "SP1", 1257408, 46204, 46280, ""], ["", "", 0]]))
      .toEqual([{ no_kw: "M1", spp: "SP1", nilai_kw: 1257408, tgl_tukar_faktur: "2026-07-01", jadwal_transfer: "2026-09-15", notes: "" }]);
    expect(parseBpUsers([["Business Partner", "Payment Group", "Username"], ["BP A", "CMSS", "PENGU338"]]))
      .toEqual([{ business_partner: "BP A", payment_group: "CMSS", username: "PENGU338" }]);
  });
});

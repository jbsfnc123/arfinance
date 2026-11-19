import { describe, expect, it } from "vitest";
import { caseRow, countTanda, type CaseRecord } from "./cases";

const rec = (p: Partial<CaseRecord>): CaseRecord => ({
  id: 1, po_customer: "PO1", document_no: null, date_po: null, business_partner: null, price_list: null,
  document_status: null, total_po: 0, total_so: 0, selisih: 0, keterangan: null, tanda: null,
  status: "archived", archived_at: "2026-11-19T00:00:00Z", completed_at: null, ...p,
});

describe("baris Arsip/Task Complete (Fase 84)", () => {
  it("tanda → label; nilai tak dikenal = Normal; Keterangan kosong = (Kosong)", () => {
    expect(caseRow(rec({ tanda: "ltkp", keterangan: " uji " })).tanda).toBe("LTKP");
    expect(caseRow(rec({ tanda: "litigasi" })).tanda).toBe("Litigasi");
    expect(caseRow(rec({ tanda: "Internal" })).tanda).toBe("Normal");
    expect(caseRow(rec({})).ket_isi).toBe("(Kosong)");
    expect(caseRow(rec({ keterangan: " uji " })).ket_isi).toBe("uji");
  });

  it("angka dari string numeric Postgres", () => {
    const r = caseRow(rec({ total_po: "1000.50" as unknown as number, selisih: "-100" as unknown as number }));
    expect(r.total_po).toBe(1000.5);
    expect(r.selisih).toBe(-100);
  });

  it("hitung per tanda", () => {
    const rows = [rec({ tanda: "ltkp" }), rec({ tanda: "ltkp" }), rec({ tanda: "tolakan" }), rec({})].map(caseRow);
    expect(countTanda(rows)).toEqual({ Normal: 1, Tolakan: 1, LTKP: 2, Litigasi: 0 });
  });
});

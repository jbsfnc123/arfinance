import { describe, expect, it } from "vitest";
import { archiveFileName, isArchiveDataset, mergeArchiveRows } from "./datasets";

describe("arsip data", () => {
  it("arsip ulang: baris baru menggantikan kunci sama, baris lama lain tetap", () => {
    const older = [{ id: 1, amount: 10 }, { id: 2, amount: 20 }];
    const newer = [{ id: 2, amount: 25 }, { id: 3, amount: 30 }];
    expect(mergeArchiveRows("erp_payments", older, newer)).toEqual([{ id: 1, amount: 10 }, { id: 2, amount: 25 }, { id: 3, amount: 30 }]);
  });
  it("kunci invoice & snapshot", () => {
    expect(mergeArchiveRows("erp_invoices", [{ invoice_no: "B" }], [{ invoice_no: "A" }]).map((r) => r.invoice_no)).toEqual(["A", "B"]);
    expect(mergeArchiveRows("aging_snapshot", [{ line_no: 2, x: 1 }], [{ line_no: 2, x: 2 }])).toEqual([{ line_no: 2, x: 2 }]);
  });
  it("nama file berversi & validasi dataset", () => {
    expect(archiveFileName("2026-06", new Date(Date.UTC(2026, 9, 11, 1, 2, 3)))).toBe("2026-06 20261011-010203.json.gz");
    expect(isArchiveDataset("erp_payments")).toBe(true);
    expect(isArchiveDataset("profiles")).toBe(false);
  });
});

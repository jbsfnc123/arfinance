import { describe, expect, it } from "vitest";
import { CHECKLIST, FILES, isFresh, lastOf, type UploadStat } from "./checklist";

describe("checklist upload harian", () => {
  const now = new Date("2026-09-26T02:00:00Z"); // 26 Sep 09:00 WIB

  it("reset per hari WIB", () => {
    expect(isFresh("2026-09-25T16:59:00Z", "day", now)).toBe(false); // 25 Sep 23:59 WIB
    expect(isFresh("2026-09-25T17:01:00Z", "day", now)).toBe(true);  // 26 Sep 00:01 WIB
    expect(isFresh(null, "day", now)).toBe(false);
  });

  it("data bulanan reset per bulan WIB", () => {
    expect(isFresh("2026-09-01T00:00:00Z", "month", now)).toBe(true);
    expect(isFresh("2026-08-31T17:30:00Z", "month", now)).toBe(true);  // 1 Sep 00:30 WIB
    expect(isFresh("2026-08-31T16:30:00Z", "month", now)).toBe(false); // 31 Agu 23:30 WIB (masih Agustus)
  });

  it("ERP dibedakan invoice/payment, catatan lama jadi cadangan", () => {
    const s = (detail: string | null, at: string): UploadStat => ({ module: "data", kind: "erp", detail, at, file: null, by: null });
    expect(lastOf(FILES.erp_invoice, [s(null, "2026-09-20T00:00:00Z")])?.at).toBe("2026-09-20T00:00:00Z");
    const stats = [s(null, "2026-09-20T00:00:00Z"), s("invoice", "2026-09-26T01:00:00Z")];
    expect(lastOf(FILES.erp_invoice, stats)?.detail).toBe("invoice");
    expect(lastOf(FILES.erp_payment, stats)?.detail).toBeNull();
    expect(lastOf(FILES.aging, stats)).toBeNull();
  });

  it("semua file di checklist terdefinisi", () => {
    for (const g of CHECKLIST) for (const f of g.files) expect(FILES[f]).toBeDefined();
  });
});

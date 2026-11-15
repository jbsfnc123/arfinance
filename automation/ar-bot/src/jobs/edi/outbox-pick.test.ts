import { describe, expect, it } from "vitest";
import { batchLabel, isKuitansiSuccess, MAX_BATCH, nextBatchDecision, type OutboxRow } from "./outbox-pick";

// Baris contoh dari Outbox Invoice.html (6 invoice, status New).
const rows: OutboxRow[] = [
  { id: "2140295", docNo: "INV001412261115001", pfiNo: "PFI00141226111400600", vendorInvoiceNo: "SI/150452/XI/XXVI/TRA", invoiceDate: "09-11-2026", totalNet: "1.000" },
  { id: "2140296", docNo: "INV001412261115002", pfiNo: "PFI00141226111400500", vendorInvoiceNo: "SI/150451/XI/XXVI/TRA", invoiceDate: "09-11-2026", totalNet: "1.000" },
  { id: "2140297", docNo: "INV001412261115003", pfiNo: "PFI00141226111400400", vendorInvoiceNo: "SI/150456/XI/XXVI/TRA", invoiceDate: "09-11-2026", totalNet: "1.000" },
  { id: "2140298", docNo: "INV001412261115004", pfiNo: "PFI00141226111400300", vendorInvoiceNo: "SI/150454/XI/XXVI/TRA", invoiceDate: "09-11-2026", totalNet: "1.000" },
];
const ids = rows.map((r) => r.id);

describe("Outbox Invoice — batch Create Kuitansi", () => {
  it("batch pertama jalan; list kosong = selesai", () => {
    expect(nextBatchDecision(null, ids, 0)).toBe("go");
    expect(nextBatchDecision(ids, [], 1)).toBe("done");
  });
  it("sisa list baru (sebagian / lain) = lanjut; baris yang sama masih ada semua = macet", () => {
    expect(nextBatchDecision(ids.slice(0, 2), ["9999", "8888"], 1)).toBe("go");
    expect(nextBatchDecision(ids, [...ids, "9999"], 1)).toBe("stuck");
    expect(nextBatchDecision(ids, ids.slice(1), 1)).toBe("go");
  });
  it("batas batch", () => {
    expect(nextBatchDecision(null, ids, MAX_BATCH)).toBe("limit");
    expect(nextBatchDecision(null, ids, 3, 3)).toBe("limit");
  });
  it("pesan EDI & label log", () => {
    expect(isKuitansiSuccess("Create kuitansi berhasil")).toBe(true);
    expect(isKuitansiSuccess("Create kuitansi dibatalkan.")).toBe(false);
    expect(isKuitansiSuccess("Silahkan pilih invoice terlebih dahulu.")).toBe(false);
    expect(isKuitansiSuccess("Gagal: invoice sudah dibuat kuitansi")).toBe(false);
    expect(isKuitansiSuccess("")).toBe(false);
    expect(batchLabel(rows)).toBe("INV001412261115001 (SI/150452/XI/XXVI/TRA), INV001412261115002 (SI/150451/XI/XXVI/TRA), INV001412261115003 (SI/150456/XI/XXVI/TRA) … +1 lainnya");
  });
});

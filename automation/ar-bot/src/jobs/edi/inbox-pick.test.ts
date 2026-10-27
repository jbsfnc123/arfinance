import { describe, expect, it } from "vitest";
import { inboxLimit, isSuccess, nextCompleted, rowLabel, type InboxRow } from "./inbox-pick";

// Baris contoh dari INVOICE - INBOX.html (6 Completed, 2 Delete); urutan diubah agar ada baris non-Completed di atas.
const sample: InboxRow[] = [
  { id: "461117", docNo: "PFI240116079400", status: "Delete", poNo: "APO10068230000003198", sj: "SJ/124506/XXIII/TRA" },
  { id: "2021932", docNo: "PFI00124626102704000", status: "Completed", poNo: "APO60000260000011530", sj: "SJ/176053/XXVI/TRA" },
  { id: "2021931", docNo: "PFI00124626102703900", status: "Completed", poNo: "APO60000260000011551", sj: "SJ/173528/XXVI/TRA" },
  { id: "460970", docNo: "PFI240116065100", status: "Delete", poNo: "APO10068230000003171", sj: "SJ/124361/XXIII/TRA" },
  { id: "2021930", docNo: "PFI00124626102703800", status: " completed ", poNo: "APO60000260000011530", sj: "SJ/175138/XXVI/TRA" },
];

describe("Invoice Inbox — pilih baris", () => {
  it("baris teratas berstatus Completed; baris di atasnya yang bukan Completed dilewati", () => {
    const r = nextCompleted(sample, new Set());
    expect(r.row?.id).toBe("2021932");
    expect(r.skipped.map((x) => x.status)).toEqual(["Delete"]);
  });
  it("baris yang sudah dicoba tidak dipilih lagi (tidak berputar bila EDI menolak)", () => {
    const tried = new Set(["2021932", "2021931"]);
    const r = nextCompleted(sample, tried);
    expect(r.row?.id).toBe("2021930");                // status " completed " tetap dikenali
    expect(r.skipped.map((x) => x.id)).toEqual(["461117", "460970"]);
    expect(nextCompleted(sample, new Set([...tried, "2021930"])).row).toBeNull();
  });
  it("pesan hasil, batas per run, label log", () => {
    expect(isSuccess("Proses sukses!\nDocument Invoice berada di menu Draft")).toBe(true);
    expect(isSuccess("PFI sudah dibuat invoice")).toBe(false);
    expect(inboxLimit(0)).toBe(200);
    expect(inboxLimit(undefined)).toBe(200);
    expect(inboxLimit(5)).toBe(5);
    expect(inboxLimit(999)).toBe(200);
    expect(rowLabel(sample[1])).toBe("PFI00124626102704000 · PO APO60000260000011530 · SJ SJ/176053/XXVI/TRA");
  });
});

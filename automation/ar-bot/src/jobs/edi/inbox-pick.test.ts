import { describe, expect, it } from "vitest";
import { inboxLimit, inboxModeOf, isAcceptSuccess, isSuccess, MODE_STATUS, nextCompleted, nextWithStatus, rowLabel, type InboxRow } from "./inbox-pick";

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

// Baris contoh dari INVOICE - INBOX - NEW.html (status New + Delete di bawah).
const sampleNew: InboxRow[] = [
  { id: "2025697", docNo: "PFI00124626103002400", status: "New", poNo: "APO10009260000005683", sj: "SJ/180853/XXVI/TRA" },
  { id: "2025696", docNo: "PFI00124626103002300", status: "New", poNo: "APO10009260000005683", sj: "SJ/181294/XXVI/TRA" },
  { id: "461117", docNo: "PFI240116079400", status: "Delete", poNo: "APO10068230000003198", sj: "SJ/124506/XXIII/TRA" },
];

describe("Invoice Inbox — mode New (Accept)", () => {
  it("baris New teratas berurutan; Delete dilewati; berhenti saat New habis", () => {
    expect(nextWithStatus(sampleNew, new Set(), "New").row?.docNo).toBe("PFI00124626103002400");
    expect(nextWithStatus(sampleNew, new Set(["2025697"]), "New").row?.docNo).toBe("PFI00124626103002300");
    const done = nextWithStatus(sampleNew, new Set(["2025697", "2025696"]), "New");
    expect(done.row).toBeNull();
    expect(done.skipped.map((x) => x.status)).toEqual(["Delete"]);
    expect(nextWithStatus(sample, new Set(), "Completed").row?.id).toBe(nextCompleted(sample, new Set()).row?.id);
  });
  it("pesan Accept & mode", () => {
    expect(isAcceptSuccess("Proses accept sukses!\nDocument PFI berada di menu Outbox, menunggu proses Posted!")).toBe(true);
    expect(isAcceptSuccess("Accept pfi dibatalkan!")).toBe(false);
    expect(isAcceptSuccess("PFI sudah di-accept")).toBe(false);
    expect(inboxModeOf("new")).toBe("new");
    expect(inboxModeOf(undefined)).toBe("completed");
    expect(MODE_STATUS.new).toBe("New");
  });
});

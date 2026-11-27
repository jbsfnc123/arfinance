// Fase 93: katalog & bantu riwayat BOT Mitra10, logika faktur bersama (applyPoList / groupPages).
import { describe, expect, it } from "vitest";
import {
  BOT_JOBS, confirmText, defaultParams, duration, fakturQueue, lastRunFor, mergeItemStatus, progressView, runSummary, type BotRun,
} from "./bot";
import { applyPoList, fakturFileName, groupPages, type FakturItem } from "./faktur";

const run = (o: Partial<BotRun>): BotRun => ({
  id: 1, jobs: [{ id: "edi.gr" }], dry_run: false, status: "success", requested_at: "2026-11-27T04:00:00Z",
  started_at: "2026-11-27T04:00:10Z", finished_at: "2026-11-27T04:01:58Z", result: null, log_tail: null, error: null,
  mine: true, requested_name: "A", ...o,
});

describe("katalog BOT", () => {
  it("5 job dengan nama AR Workspace", () => {
    expect(BOT_JOBS.map((j) => j.label)).toEqual(["Update Receiving", "Update Kwitansi", "Inbox New/Completed", "Outbox Create Kuitansi", "Upload Faktur Pajak"]);
    expect(BOT_JOBS.filter((j) => j.write).map((j) => j.id)).toEqual(["edi.invoice-inbox", "edi.outbox-invoice", "edi.upload-faktur"]);
  });
  it("param bawaan sama dengan AR Bot", () => {
    expect(defaultParams("edi.gr", "2026-11-27")).toEqual({ push: true, start: "2026-10-28", end: "2026-11-27" });
    expect(defaultParams("edi.kwitansi", "2026-11-27")).toEqual({ push: true, start: "2026-11-01", end: "2026-11-27" });
    expect(defaultParams("edi.invoice-inbox", "2026-11-27")).toEqual({ inboxMode: "completed", limit: 0 });
  });
  it("teks konfirmasi sesuai mode", () => {
    expect(confirmText("edi.invoice-inbox", { inboxMode: "new", limit: 5 })).toMatch(/Accept.*maks\. 5 per akun/);
    expect(confirmText("edi.invoice-inbox", {})).toMatch(/Create Invoice/);
    expect(confirmText("edi.outbox-invoice", { accounts: ["a", "b"] })).toMatch(/Create Kuitansi.*2 akun/);
    expect(confirmText("edi.upload-faktur", { mode: "draft" }, 3)).toMatch(/^3 faktur.*transit/);
  });
});

describe("riwayat run", () => {
  it("run terakhir per job & durasi", () => {
    const runs = [run({ id: 3, jobs: [{ id: "edi.kwitansi" }] }), run({ id: 2 }), run({ id: 1 })];
    expect(lastRunFor(runs, "edi.gr")?.id).toBe(2);
    expect(lastRunFor(runs, "edi.outbox-invoice")).toBeNull();
    expect(duration(runs[0])).toBe("1 mnt 48 dtk");
    expect(duration(run({ started_at: "2026-11-27T04:00:00Z", finished_at: null }), Date.parse("2026-11-27T04:00:42Z"))).toBe("42 dtk");
  });
  it("ringkasan per job (galat diutamakan)", () => {
    const r = run({ jobs: [{ id: "edi.gr" }, { id: "edi.kwitansi" }], result: { jobs: [
      { id: "edi.gr", status: "ok", summary: "4/4 akun · 0 GR baru" }, { id: "edi.kwitansi", status: "failed", error: "file belum muncul" },
    ] } });
    expect(runSummary(r)).toBe("Receiving: 4/4 akun · 0 GR baru · Kwitansi: file belum muncul");
  });
  it("status hasil run digabung ke daftar lokal (tanpa beda huruf)", () => {
    const items = [{ invoice: "INV1", status: "Ready" }, { invoice: "inv2", status: "Ready" }];
    expect(mergeItemStatus(items, [{ invoice: "INV2", status: "Uploaded & Sent", ok: true }]).map((i) => i.status)).toEqual(["Ready", "Uploaded & Sent"]);
  });
});

describe("progressView (KPI Kertas Kerja, Fase 94)", () => {
  it("run tidak aktif → null; sebelum progres → catatan", () => {
    expect(progressView(run({ status: "success" }))).toBeNull();
    expect(progressView(run({ status: "queued" }))).toMatchObject({ title: "Receiving", note: "Menunggu bot…", steps: [] });
    expect(progressView(run({ status: "running" }))?.note).toBe("Menyiapkan bot…");
  });
  it("Receiving: akun i/n, langkah selesai/aktif/belum; uji coba melewati Upload CSV", () => {
    const v = progressView(run({ status: "running", dry_run: true, progress: { job: "edi.gr", steps: ["Login", "Download CSV", "Upload CSV"], step: 1, account: 2, accounts: 4, skipped: [2] } }))!;
    expect(v.title).toBe("Receiving (uji coba)");
    expect(v.account).toBe("Akun 2/4");
    expect(v.steps.map((s) => s.state)).toEqual(["done", "now", "skip"]);
  });
  it("Inbox Completed: hitungan done/total di langkah aktif; satu akun tanpa label akun", () => {
    const v = progressView(run({ status: "running", jobs: [{ id: "edi.invoice-inbox", params: { inboxMode: "completed" } }],
      progress: { job: "edi.invoice-inbox", steps: ["Login", "Buka Inbox", "Create Invoice"], step: 2, done: 1, total: 10, account: 1, accounts: 1 } }))!;
    expect(v.title).toBe("Inbox Completed");
    expect(v.account).toBeUndefined();
    expect(v.steps[2]).toEqual({ label: "Create Invoice", state: "now", count: "1/10" });
    expect(progressView(run({ status: "running", jobs: [{ id: "edi.invoice-inbox", params: { inboxMode: "new" } }] }))?.title).toBe("Inbox New");
  });
});

const item = (o: Partial<FakturItem>): FakturItem => ({ index: 1, invoice: "I", faktur: "F", filename: "F.pdf", pages: 1, size: 1, checked: true, status: "Ready", ...o });

describe("Upload Faktur", () => {
  it("antrean: tercentang & belum terunggah; not_found butuh status / No PO", () => {
    const items = [item({ invoice: "A" }), item({ invoice: "B", status: "Uploaded & Sent" }), item({ invoice: "C", checked: false }),
      item({ invoice: "D", status: "Not Found in Draft" }), item({ invoice: "E", no_po: "PO1" })];
    expect(fakturQueue(items, "draft").map((i) => i.invoice)).toEqual(["A", "D", "E"]);
    expect(fakturQueue(items, "not_found").map((i) => i.invoice)).toEqual(["D", "E"]);
  });
  it("applyPoList: pilih cepat, tanpa beda huruf, invoice tak cocok dicatat", () => {
    const r = applyPoList([item({ invoice: "INV-1" }), item({ invoice: "INV-2" })],
      [{ invoice: "inv-1", no_po: " PO9 ", no_sj: "SJ9", open_amt: 1500 }, { invoice: "X", no_po: "", no_sj: "", open_amt: 0 }], { select: true });
    expect(r.matched).toBe(1);
    expect(r.unmatchedExcel).toEqual(["X"]);
    expect(r.items.map((i) => [i.invoice, i.checked, i.in_po, i.no_po, i.open_amt])).toEqual([["INV-1", true, true, "PO9", 1500], ["INV-2", false, false, undefined, undefined]]);
  });
  it("groupPages: halaman lanjutan & referensi invoice; nama file aman", () => {
    const g = groupPages(["Nomor Seri Faktur Pajak : 040\n(Referensi: INV-7)", "lanjutan", "Nomor Seri Faktur Pajak : 041"]);
    expect(g.map((x) => [x.faktur, x.invoice, x.pages])).toEqual([["040", "INV-7", [0, 1]], ["041", "041", [2]]]);
    expect(fakturFileName("a/b:c")).toBe("a_b_c.pdf");
  });
});

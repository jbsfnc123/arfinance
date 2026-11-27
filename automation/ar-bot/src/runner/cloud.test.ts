// Fase 93: mode cloud — pemetaan akun, param yang diizinkan, sheet kerja Upload Faktur, log ringkas, rahasia dari env, browser Linux.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { mergeConfig } from "~/shared/catalog";
import type { RunEvent } from "~/shared/types";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arbot-cloud-"));
process.env.ARBOT_DATA_DIR = tmp;

let cloud: typeof import("./cloud");
let faktur: typeof import("~/faktur/store");
let invoices: typeof import("~/faktur/invoices");
beforeAll(async () => {
  cloud = await import("./cloud");
  faktur = await import("~/faktur/store");
  invoices = await import("~/faktur/invoices");
});

const config = mergeConfig({
  edi: { accounts: [
    { id: "a1", label: "Satu", username: "VendorSatu", active: true },
    { id: "a2", label: "Dua", username: "vendordua", active: false },
  ], amountTolerance: 100, loginUrl: "" },
});

describe("mapAccounts", () => {
  it("kosong = semua akun aktif (undefined)", () => {
    expect(cloud.mapAccounts(undefined, config)).toBeUndefined();
    expect(cloud.mapAccounts([], config)).toBeUndefined();
  });
  it("username (tanpa beda huruf) atau id → id akun", () => {
    expect(cloud.mapAccounts(["vendorsatu", "A2"], config)).toEqual(["a1", "a2"]);
  });
  it("akun tak dikenal → galat", () => {
    expect(() => cloud.mapAccounts(["lain"], config)).toThrow(/belum terdaftar/);
  });
});

describe("toSpecs", () => {
  it("hanya param yang diizinkan; limit dibatasi 200; items faktur dipisah", () => {
    const { specs, faktur: f } = cloud.toSpecs([
      { id: "edi.gr", params: { start: "2026-11-01", end: "2026-11-27", push: true, accounts: ["VendorSatu"], evil: "x" } },
      { id: "edi.invoice-inbox", params: { inboxMode: "new", limit: 999 } },
      { id: "edi.upload-faktur", params: { mode: "not_found", items: [{ invoice: "INV1" }] } },
    ], config);
    expect(specs[0]).toEqual({ id: "edi.gr", params: { accounts: ["a1"], push: true, start: "2026-11-01", end: "2026-11-27" } });
    expect(specs[1].params).toEqual({ accounts: undefined, inboxMode: "new", limit: 200 });
    expect(specs[2].params).toEqual({ accounts: undefined, mode: "not_found" });
    expect(f).toEqual({ mode: "not_found", items: [{ invoice: "INV1" }] });
  });
  it("job di luar 5 job EDI ditolak", () => {
    expect(() => cloud.toSpecs([{ id: "jasper.aging" }], config)).toThrow(/tidak didukung/);
  });
});

describe("writeFakturWork", () => {
  it("mode draft/not_found → manifest Invoice+FP (nama file dibersihkan dari path)", () => {
    const n = cloud.writeFakturWork("draft", [
      { invoice: "INV1", faktur: "0401", filename: "../x/0401.pdf", pages: 2, no_po: "PO1", open_amt: 1500 },
      { invoice: "", faktur: "0402", filename: "0402.pdf" },
    ]);
    expect(n).toBe(1);
    const m = faktur.loadManifest();
    expect(m.items).toHaveLength(1);
    expect(m.items[0]).toMatchObject({ invoice: "INV1", filename: "0401.pdf", pages: 2, checked: true, status: "Ready", no_po: "PO1", open_amt: 1500 });
    expect(m.totalPages).toBe(2);
  });
  it("mode fill → sheet Invoice", () => {
    expect(cloud.writeFakturWork("fill", [{ invoice: "INV9", no_po: "PO9", no_sj: "SJ9", open_amt: 10 }])).toBe(1);
    expect(invoices.loadInvoices().items[0]).toEqual({ invoice: "INV9", no_po: "PO9", no_sj: "SJ9", open_amt: 10, checked: true, status: "Ready" });
  });
});

describe("logLines", () => {
  it("hanya event log, dengan penanda level", () => {
    const ev: RunEvent[] = [
      { t: "log", at: "2026-11-27T03:00:00Z", level: "ok", msg: "selesai" },
      { t: "item", at: "2026-11-27T03:00:01Z", invoice: "I", status: "Uploaded", ok: true },
      { t: "log", at: "2026-11-27T03:00:02Z", level: "error", msg: "gagal" },
    ];
    expect(cloud.logLines(ev)).toEqual(["10.00.00 ✔ selesai", "10.00.02 ✖ gagal"]);
  });
});

describe("lastProgress", () => {
  it("event progress terakhir (dengan job), null bila belum ada", () => {
    expect(cloud.lastProgress([{ t: "log", at: "a", level: "info", msg: "x" }])).toBeNull();
    const ev: RunEvent[] = [
      { t: "progress", at: "1", job: "edi.gr", steps: ["Login", "Download CSV", "Upload CSV"], step: 0, account: 1, accounts: 4 },
      { t: "log", at: "2", level: "info", msg: "x" },
      { t: "progress", at: "3", job: "edi.gr", steps: ["Login", "Download CSV", "Upload CSV"], step: 1, account: 1, accounts: 4 },
    ];
    expect(cloud.lastProgress(ev)).toEqual({ at: "3", job: "edi.gr", steps: ["Login", "Download CSV", "Upload CSV"], step: 1, account: 1, accounts: 4 });
  });
});

describe("rahasia & browser cloud", () => {
  it("ARBOT_SECRETS dipakai tanpa DPAPI", async () => {
    vi.resetModules();
    process.env.ARBOT_SECRETS = JSON.stringify({ botPassword: "x", "edi:a1": "y" });
    const { loadSecrets } = await import("~/core/store");
    expect(loadSecrets()).toEqual({ botPassword: "x", "edi:a1": "y" });
    delete process.env.ARBOT_SECRETS;
  });
  it("CHROME_PATH / Chrome Linux dikenali", async () => {
    const { findBrowser } = await import("~/core/browser");
    process.env.CHROME_PATH = "/opt/chrome";
    expect(findBrowser("auto", (f) => f === "/opt/chrome")?.path).toBe("/opt/chrome");
    delete process.env.CHROME_PATH;
    expect(findBrowser("chrome", (f) => f === "/usr/bin/google-chrome")?.path).toBe("/usr/bin/google-chrome");
  });
});

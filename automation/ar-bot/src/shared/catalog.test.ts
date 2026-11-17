import { describe, expect, it } from "vitest";
import { mergeConfig, nextRun, redact, validTime } from "./catalog";

describe("jadwal", () => {
  const s = { enabled: true, days: [1, 2, 3, 4, 5] as (1 | 2 | 3 | 4 | 5)[], time: "10:00" };
  it("hari kerja berikutnya", () => {
    // Sabtu 2026-10-10 12:00 → Senin 2026-10-12 10:00
    expect(nextRun(s, new Date(2026, 9, 10, 12, 0))?.toString()).toBe(new Date(2026, 9, 12, 10, 0).toString());
  });
  it("hari ini bila jamnya belum lewat", () => {
    expect(nextRun(s, new Date(2026, 9, 12, 9, 59))?.toString()).toBe(new Date(2026, 9, 12, 10, 0).toString());
    expect(nextRun(s, new Date(2026, 9, 12, 10, 0))?.toString()).toBe(new Date(2026, 9, 13, 10, 0).toString());
  });
  it("mati / tanpa hari / jam tidak valid", () => {
    expect(nextRun({ ...s, enabled: false })).toBeNull();
    expect(nextRun({ ...s, days: [] })).toBeNull();
    expect(validTime("24:00")).toBe(false);
    expect(validTime("07:30")).toBe(true);
  });
});

describe("rahasia & konfigurasi", () => {
  it("redact menyamarkan semua kemunculan", () => {
    expect(redact("login rahasia123 ok rahasia123", ["rahasia123", undefined, "ab"])).toBe("login ●●● ok ●●●");
  });
  it("mergeConfig mengisi kunci baru", () => {
    const c = mergeConfig({ retentionDays: 10, browser: { channel: "edge" } as never });
    expect(c.retentionDays).toBe(10);
    expect(c.browser).toEqual({ channel: "edge", headless: true });
    expect(c.chains[0].id).toBe("harian-ar");
  });
});

describe("rentang Send Invoice", () => {
  it("Senin s/d hari ini; akhir pekan = Senin–Jumat", async () => {
    const { weekToDate } = await import("./catalog");
    expect(weekToDate("2026-10-12")).toEqual({ start: "2026-10-12", end: "2026-10-12" }); // Senin
    expect(weekToDate("2026-10-13")).toEqual({ start: "2026-10-12", end: "2026-10-13" }); // Selasa
    expect(weekToDate("2026-10-14")).toEqual({ start: "2026-10-12", end: "2026-10-14" }); // Rabu
    expect(weekToDate("2026-10-16")).toEqual({ start: "2026-10-12", end: "2026-10-16" }); // Jumat
    expect(weekToDate("2026-10-10")).toEqual({ start: "2026-10-05", end: "2026-10-09" }); // Sabtu
    expect(weekToDate("2026-10-11")).toEqual({ start: "2026-10-05", end: "2026-10-09" }); // Minggu
    expect(weekToDate("2026-11-02")).toEqual({ start: "2026-11-02", end: "2026-11-02" }); // Senin lintas bulan
    expect(weekToDate("2026-10-01")).toEqual({ start: "2026-09-28", end: "2026-10-01" }); // Kamis lintas bulan
  });
});

describe("tanggal bawaan per job", () => {
  it("GR 30 hari, Kwitansi bulan ini, Invoice by Date awal bulan, SJ n hari", async () => {
    const { defaultDates } = await import("./catalog");
    expect(defaultDates("edi.gr", "2026-10-10")).toEqual({ start: "2026-09-10", end: "2026-10-10" });
    expect(defaultDates("edi.gr", "2026-03-01")).toEqual({ start: "2026-01-30", end: "2026-03-01" });
    expect(defaultDates("edi.gr", "2027-01-15")).toEqual({ start: "2026-12-16", end: "2027-01-15" });
    expect(defaultDates("edi.kwitansi", "2026-10-10")?.start.slice(0, 7)).toBe("2026-10");
    expect(defaultDates("jasper.invoice-by-date", "2026-10-10")).toEqual({ start: "2026-10-01", end: "2026-10-10" });
    expect(defaultDates("jasper.sj", "2026-10-10", 7)).toEqual({ start: "2026-10-04", end: "2026-10-10" });
    expect(defaultDates("jasper.send-invoice", "2026-10-14")).toEqual({ start: "2026-10-12", end: "2026-10-14" });
    expect(defaultDates("jasper.aging", "2026-10-10")).toBeNull();
  });
});

describe("urutan Jalankan beberapa task", () => {
  it("multiOrder: simpanan dipakai, id asing/ganda dibuang, task baru di akhir", async () => {
    const { multiOrder, JOBS } = await import("./catalog");
    const o = multiOrder(["edi.outbox-invoice", "xx", "edi.gr", "edi.gr"]);
    expect(o.slice(0, 2)).toEqual(["edi.outbox-invoice", "edi.gr"]);
    expect(o).toHaveLength(JOBS.length);
    expect(new Set(o).size).toBe(o.length);
    expect(multiOrder(undefined)).toEqual(JOBS.map((j) => j.id));
  });
  it("moveInOrder & orderedSelection", async () => {
    const { moveInOrder, orderedSelection } = await import("./catalog");
    expect(moveInOrder(["a", "b", "c", "d"], "d", 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveInOrder(["a", "b", "c", "d"], "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveInOrder(["a", "b"], "z", 0)).toEqual(["a", "b"]);
    expect(orderedSelection(["edi.outbox-invoice", "edi.gr", "edi.invoice-inbox"], ["edi.invoice-inbox", "edi.outbox-invoice"]))
      .toEqual(["edi.outbox-invoice", "edi.invoice-inbox"]);
  });
  it("mergeConfig mengisi order untuk config lama", async () => {
    const { mergeConfig, JOBS } = await import("./catalog");
    const c = mergeConfig({ multi: { jobs: ["edi.gr"], parallel: false } } as never);
    expect(c.multi.order).toHaveLength(JOBS.length);
    expect(c.multi.jobs).toEqual(["edi.gr"]);
  });
});

describe("Aging banyak bulan — cut off akhir bulan", () => {
  it("akhir bulan, kabisat, bulan berjalan = hari ini, bulan depan dibuang", async () => {
    const { monthEndCutoffs, monthEnd } = await import("./catalog");
    expect(monthEndCutoffs(2026, [2, 1], "2026-11-17")).toEqual(["2026-01-31", "2026-02-28"]);
    expect(monthEnd(2028, 2)).toBe("2028-02-29");
    expect(monthEndCutoffs(2026, [10, 11, 12], "2026-11-17")).toEqual(["2026-10-31", "2026-11-17"]);
    expect(monthEndCutoffs(2027, [1], "2026-11-17")).toEqual([]);
    expect(monthEndCutoffs(2025, [4, 4, 13, 0], "2026-11-17")).toEqual(["2025-04-30"]);
  });
  it("mergeConfig mengisi downloadDir", async () => {
    const { mergeConfig } = await import("./catalog");
    expect(mergeConfig({}).downloadDir).toBe("");
    expect(mergeConfig({ downloadDir: "  D:\AR  " }).downloadDir).toBe("D:\AR");
  });
});

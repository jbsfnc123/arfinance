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

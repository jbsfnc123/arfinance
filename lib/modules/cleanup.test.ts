import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { chunkKeys, CLEANUP_CATEGORIES, defaultCutoff } from "./cleanup";

describe("katalog pembersihan", () => {
  it("kunci kategori sama persis dengan SQL (cleanup_overview & cleanup_candidates di migrasi 0046)", () => {
    const sql = readFileSync("supabase/migrations/0046_data_lifecycle.sql", "utf8");
    const overview = sql.match(/foreach c in array array\[([\s\S]*?)\] loop/)![1].match(/'([a-z_]+)'/g)!.map((s) => s.slice(1, -1));
    expect(CLEANUP_CATEGORIES.map((c) => c.key)).toEqual(overview);
    for (const c of CLEANUP_CATEGORIES) {
      expect(sql).toContain(`when '${c.key}' then return query`);
      expect(sql).toContain(`when '${c.key}' then`);
    }
  });
  it("kategori berbasis tanggal batas = yang memakai p_cutoff di SQL", () => {
    const sql = readFileSync("supabase/migrations/0046_data_lifecycle.sql", "utf8");
    for (const c of CLEANUP_CATEGORIES) {
      const block = sql.split(`when '${c.key}' then return query`)[1].split(/\n  when '|\n  else /)[0];
      expect(block.includes("p_cutoff"), c.key).toBe(c.usesCutoff);
    }
  });
  it("tanggal batas bawaan = awal bulan, 6 bulan lalu", () => {
    expect(defaultCutoff("2026-10-01")).toBe("2026-04-01");
    expect(defaultCutoff("2026-03-31")).toBe("2025-09-01");
  });
  it("kunci dipecah per 5.000", () => {
    const keys = Array.from({ length: 12001 }, (_, i) => String(i));
    expect(chunkKeys(keys).map((c) => c.length)).toEqual([5000, 5000, 2001]);
    expect(chunkKeys([])).toEqual([]);
  });
});

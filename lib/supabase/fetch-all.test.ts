import { describe, expect, it } from "vitest";
import { fetchAll } from "./fetch-all";
import { fillHeight } from "@/lib/ui/fill-height";
import { compareCells } from "@/lib/local/table";

const source = Array.from({ length: 2345 }, (_, i) => ({ id: i }));
const fake = (calls: [number, number][]) => (from: number, to: number) => {
  calls.push([from, to]);
  return Promise.resolve({ data: source.slice(from, to + 1), error: null });
};

describe("fetchAll", () => {
  it("mengambil semua baris melewati batas 1.000 per permintaan", async () => {
    const calls: [number, number][] = [];
    const r = await fetchAll(fake(calls));
    expect(r.data).toHaveLength(2345);
    expect(r.data.at(-1)).toEqual({ id: 2344 });
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("tepat kelipatan halaman → satu permintaan tambahan kosong lalu berhenti; error dikembalikan", async () => {
    const calls: [number, number][] = [];
    const r = await fetchAll((a, b) => { calls.push([a, b]); return Promise.resolve({ data: a < 20 ? source.slice(a, b + 1) : [], error: null }); }, { size: 10 });
    expect(r.data).toHaveLength(20);
    expect(calls).toHaveLength(3);
    const e = await fetchAll(() => Promise.resolve({ data: null, error: { message: "x" } }));
    expect(e.error?.message).toBe("x");
  });
});

describe("tinggi tabel & urutan", () => {
  it("fillHeight = sisa layar di bawah tabel, dengan batas bawah", () => {
    expect(fillHeight(708, 290)).toBe(708 - 290 - 24);
    expect(fillHeight(708, 290, { reserve: 36 })).toBe(708 - 290 - 24 - 36);
    expect(fillHeight(708, 600)).toBe(320);
    expect(fillHeight(1380, 245)).toBe(1111);
  });

  it("sel kosong selalu di akhir; angka & teks numerik diurutkan wajar", () => {
    const vals = [5, null, 12, "", 3];
    expect([...vals].sort((a, b) => compareCells(a, b, true, 1))).toEqual([3, 5, 12, null, ""]);
    expect([...vals].sort((a, b) => compareCells(a, b, true, -1))).toEqual([12, 5, 3, null, ""]);
    expect(["SJ/10", "SJ/9", "SJ/100"].sort((a, b) => compareCells(a, b, false, 1))).toEqual(["SJ/9", "SJ/10", "SJ/100"]);
  });
});

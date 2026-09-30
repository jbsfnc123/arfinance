import { describe, expect, it } from "vitest";
import { buildSearchIndex, compareCells, searchMatcher, type LCol } from "./table";

// Pencarian LocalTable lewat indeks (dibangun sekali per data) harus memberi hasil yang SAMA dengan cara lama
// (per kolom, per ketukan) — perubahan ini hanya untuk kecepatan (INP kotak Cari).
type Row = { id: number; sj: string | null; bp: string; amt: number | null; tgl: string | null };
const COLS: LCol<Row>[] = [
  { k: "sj", l: "SJ" }, { k: "bp", l: "BP" }, { k: "amt", l: "Nominal", n: true },
  { k: "tgl", l: "Tanggal", d: true, text: (r) => (r.tgl ? r.tgl.split("-").reverse().join("/") : "") },
];
const SEARCH: (keyof Row & string)[] = ["sj", "bp", "amt", "tgl"];
const ROWS: Row[] = [
  { id: 1, sj: "SJ/000123/IX/TRA", bp: "Toko Maju Jaya", amt: 1500000, tgl: "2026-09-01" },
  { id: 2, sj: null, bp: "TOKO sinar", amt: null, tgl: null },
  { id: 3, sj: "MR/77", bp: "Anyar Retail - RKM Solo", amt: 0, tgl: "2026-08-15" },
  { id: 4, sj: "sj/9", bp: "Ábc Ünicode", amt: 42, tgl: "2025-12-31" },
];

function oldMatch(q: string) {
  const needle = q.trim().toLowerCase();
  const searchCols = SEARCH.map((k) => COLS.find((c) => c.k === k));
  return (r: Row) => !needle || SEARCH.some((k, i) => {
    const c = searchCols[i];
    return (c?.text ? c.text(r) : String(r[k] ?? "")).toLowerCase().includes(needle);
  });
}

describe("indeks pencarian LocalTable", () => {
  const index = buildSearchIndex(ROWS, SEARCH, COLS);
  const queries = ["", "  ", "toko", "TOKO", "sj/", "sj/0001", "1500000", "0", "01/09/2026", "/2026", "rkm solo", "ünicode", "null",
    "undefined", "maju jaya", "jaya1500000", "tra toko", "42", "x"];
  it.each(queries)("hasil sama dengan cara lama: %j", (q) => {
    const now = searchMatcher(index, q), old = oldMatch(q);
    expect(ROWS.filter(now).map((r) => r.id)).toEqual(ROWS.filter(old).map((r) => r.id));
  });
  it("kata tidak cocok melintasi batas kolom", () => {
    expect(ROWS.filter(searchMatcher(index, "jaya1500000"))).toEqual([]);
  });
  it("baris baru di luar indeks tidak cocok (indeks dibangun ulang saat data berubah)", () => {
    expect(searchMatcher(index, "toko")({ id: 9, sj: "x", bp: "toko", amt: 1, tgl: null })).toBe(false);
  });
});

describe("compareCells dengan collator bersama", () => {
  it("urutan sama dengan localeCompare('id', numeric)", () => {
    const vals = ["SJ/10", "SJ/9", "sj/2", "Ábc", "abc", "B", "2026-09-01", "2026-10-01", "item 100", "item 20", "-"];
    const byNew = [...vals].sort((a, b) => compareCells(a, b, false, 1));
    const byOld = [...vals].sort((a, b) => a.localeCompare(b, "id", { numeric: true }));
    expect(byNew).toEqual(byOld);
    expect([...vals].sort((a, b) => compareCells(a, b, false, -1))).toEqual([...byOld].reverse());
  });
  it("kosong tetap di akhir, angka sebagai angka", () => {
    expect([3, null, 10, "", 2].sort((a, b) => compareCells(a, b, true, 1))).toEqual([2, 3, 10, null, ""]);
    expect([3, null, 10, 2].sort((a, b) => compareCells(a, b, true, -1))).toEqual([10, 3, 2, null]);
  });
});

describe("formatter angka bersama", () => {
  it("fmtNum/rupiah identik dengan toLocaleString('id-ID')", async () => {
    const { fmtNum, rupiah } = await import("@/lib/format");
    for (const n of [0, 7, -12, 1500000, 1234567.891, 0.5, -0.125, 25293162597, 1e21]) {
      expect(fmtNum(n)).toBe(n.toLocaleString("id-ID"));
      expect(rupiah(n)).toBe("Rp " + n.toLocaleString("id-ID"));
    }
    expect(rupiah(null)).toBe("Rp 0");
  });
});

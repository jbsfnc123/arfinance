import { describe, expect, it } from "vitest";
import { completeness, DECK_SHEETS, emptyMonth, parseTemplate, SHEET_TOTAL, templateSheets, type MonthData } from "./template";
import { appLabel, compressJson, decodeMonth, deckState } from "./store";

// Isi semua nilai wajib + satu baris tabel, seperti user mengisi template.
function filledTemplate(month: string) {
  const sheets = templateSheets(month);
  for (const s of sheets) {
    for (const r of s.rows) {
      if (typeof r[0] === "string" && /^[a-z0-9_]+(:\d+)?$/.test(r[0]) && r.length === 3) r[2] = r[0] === "collpct:0" ? "0,85" : "1.234.567";
    }
  }
  const coll = sheets.find((s) => s.name === "Collection")!.rows;
  const at = coll.findIndex((r) => r[0] === "#TABEL Top Unpaid W");
  coll.splice(at + 2, 0, ["PG Satu", "2.500.000"]);
  return sheets;
}

describe("Template Presentasi AR", () => {
  it("8 sheet slide + Petunjuk, kunci unik", () => {
    const sheets = templateSheets("2026-09");
    expect(sheets.map((s) => s.name)).toEqual(["Petunjuk", ...DECK_SHEETS.map((s) => s.name)]);
    expect(SHEET_TOTAL).toBe(8);
    const keys = DECK_SHEETS.flatMap((s) => s.fields.map((f) => f.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining(["sales", "amt_res:2", "cnt_trad:0", "bp_res:1", "s7_bp:5", "coll_w:4", "open", "aging:5", "baddebt:4", "pay_amt"]));
  });

  it("upload: angka Rupiah teks, tabel, bulan file, dan kelengkapan", () => {
    const r = parseTemplate(filledTemplate("2026-09"), { "sales.note": "catatan lama" });
    expect(r.fileMonth).toBe("2026-09");
    expect(r.data.series["amt_all:0"]).toBe(1234567);
    expect(r.data.series["collpct:0"]).toBeCloseTo(0.85);
    expect(r.data.tables["Top Unpaid W"]).toEqual([{ "Payment Group": "PG Satu", "Unpaid (Rp)": 2500000 }]);
    expect(r.data.tables["Uncollected"]).toEqual([]);
    expect(r.data.texts).toEqual({ "sales.note": "catatan lama" }); // teks slide dipertahankan
    expect(completeness(r.data)).toEqual({ filled: 8, total: 8, complete: true });
  });

  it("sebagian terisi → x/8; sheet hilang dilaporkan; nilai opsional boleh kosong", () => {
    const sheets = filledTemplate("2026-09").filter((s) => s.name !== "Risiko Piutang");
    const aging = sheets.find((s) => s.name === "Aging & Overdue")!.rows;
    aging.find((r) => r[0] === "open")![2] = "";
    const r = parseTemplate(sheets);
    expect(r.missingSheets).toEqual(["Risiko Piutang"]);
    expect(completeness(r.data)).toEqual({ filled: 6, total: 8, complete: false });
    expect(Number.isFinite(r.data.series["ardays:0"])).toBe(true); // diisi di template uji; opsional tidak wajib
  });

  it("bukan template → error jelas; ekspor ulang memuat nilai tersimpan", () => {
    expect(() => parseTemplate([{ name: "Sheet1", rows: [["a"]] }])).toThrow(/Bukan template Presentasi AR/);
    const d: MonthData = { ...emptyMonth(), series: { open: 99 }, tables: { Unallocated: [{ Jenis: "Write-Off", Keterangan: null, "Marketing Group": null, "Total (Rp)": 5 }] } };
    const sheets = templateSheets("2026-08", d);
    expect(sheets.find((s) => s.name === "Aging & Overdue")!.rows.find((r) => r[0] === "open")![2]).toBe(99);
    expect(parseTemplate(sheets).data.tables.Unallocated[0]["Total (Rp)"]).toBe(5);
  });
});

describe("Penyimpanan JSON terkompresi & state app", () => {
  it("kompres ↔ dekompres identik dan lebih kecil", async () => {
    const d = parseTemplate(filledTemplate("2026-09")).data;
    const b64 = await compressJson(d);
    expect(await decodeMonth(b64)).toEqual(d);
    expect(b64.length).toBeLessThan(JSON.stringify(d).length);
  });

  it("state app: seri per bulan di layer manual, tabel ber-Bulan, minggu W, label pendek", () => {
    const d9 = { ...emptyMonth(), series: { open: 10, coll_week: 3 }, tables: { "Top Unpaid W": [{ "Payment Group": "A", "Unpaid (Rp)": 1 }] }, texts: { "sales.note": "x" } };
    const d8 = { ...emptyMonth(), series: { open: 8 } };
    const st = deckState([{ month: "2026-09", data: d9 }, { month: "2026-08", data: d8 }]);
    expect(st.layers.manual.open).toEqual({ "2026-08": 8, "2026-09": 10 });
    expect(st.manual["Top Unpaid W"]).toEqual([{ "Payment Group": "A", "Unpaid (Rp)": 1, Bulan: "2026-09" }]);
    expect(st.config).toEqual({ month: "2026-09", week: 3 });
    expect(st.texts).toEqual({ "2026-09": { "sales.note": "x" } });
    expect([appLabel("amt_trad:1"), appLabel("s7_amt:5"), appLabel("coll_act:4"), appLabel("aging:0"), appLabel("open")])
      .toEqual(["Ex DO", "Surabaya", "End User - Project", "Due 1-15", "Open Amount — total outstanding (Rp)"]);
  });
});

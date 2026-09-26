import { describe, expect, it } from "vitest";
import { deckCollection, groupIdx } from "./collection";
import { diffSaved, isEmptyDiff, layersFrom, SALES_HISTORY_KEY, type Saved } from "./assemble";
import type { Target } from "@/lib/local/datasets";

const t = (p: Partial<Target>): Target => ({ month: "2026-09", invoice_no: "", target: 0, marketing: null, collection_name: null, business_partner: null, due_date: null, branch: null, ...p });

describe("Collection otomatis Presentasi AR", () => {
  it("pemetaan marketing group seperti app lama", () => {
    expect(groupIdx("01-Traditional")).toBe(0);
    expect(groupIdx("03-Reseller")).toBe(1);
    expect(groupIdx("16-Modern Market National")).toBe(2);
    expect(groupIdx("02-Modern Market")).toBe(3);
    expect(groupIdx("04-Proyek")).toBe(4);
    expect(groupIdx("07-End User - Corporate")).toBe(4);
    expect(groupIdx("Lain")).toBe(-1);
  });

  it("target, realisasi (alloc in target), s/d minggu W, target bulan depan, collection %", () => {
    const targets = [
      t({ invoice_no: "A", marketing: "01-Traditional", target: 1000 }),
      t({ invoice_no: "B", marketing: "03-Reseller", target: 500 }),
      t({ month: "2026-10", invoice_no: "C", marketing: "01-Traditional", target: 700 }),
    ];
    const payments = [
      { invoice_no: "A", payment_date: "2026-09-05", amount: 300 },
      { invoice_no: "A", payment_date: "2026-09-20", amount: 200 },
      { invoice_no: "B", payment_date: "2026-09-14", amount: 500 },
      { invoice_no: "X", payment_date: "2026-09-02", amount: 999 }, // bukan invoice target
      { invoice_no: "A", payment_date: "2026-08-30", amount: 50 },  // bulan lain
    ];
    const r = deckCollection({ month: "2026-09", week: 2, targets, payments });
    expect(r).toMatchObject({ "coll_tgt:0": 1000, "coll_act:0": 500, "coll_w:0": 300, "coll_tgt:1": 500, "coll_act:1": 500, "coll_w:1": 500, "tgt_next:0": 700 });
    expect(r["collpct:0"]).toBeCloseTo(1000 / 1500);
    expect(deckCollection({ month: "2026-07", week: 2, targets, payments })).toEqual({}); // tanpa target: kosong
  });
});

describe("Susun & simpan state Presentasi", () => {
  it("prioritas manual > raw/auto > excel; auto tidak menimpa raw", () => {
    const l = layersFrom([
      { month: "2026-08", key: "over90", source: "excel", value: 1 },
      { month: "2026-08", key: "over90", source: "raw", value: 2 },
      { month: "2026-08", key: "coll_tgt:0", source: "manual", value: 9 },
      { month: "2026-08", key: "coll_tgt:0", source: "auto", value: 5 },
    ], { open: { "2026-09": 7 } }, { "coll_tgt:0": { "2026-09": 11 }, open: { "2026-09": 99 } });
    expect(l.raw).toEqual({ open: { "2026-09": 7 }, over90: { "2026-08": 2 }, "coll_tgt:0": { "2026-08": 5, "2026-09": 11 } });
    expect(l.manual).toEqual({ "coll_tgt:0": { "2026-08": 9 } });
    expect(l.excel).toEqual({ over90: { "2026-08": 1 } });
  });

  it("hanya perubahan yang dikirim; bulan tertutup diabaikan & dilaporkan", () => {
    const prev: Saved = { manual: { a: { "2026-08": 1, "2026-09": 2 } }, excel: {}, tables: { "AR Historis": [{ Bulan: "2026-09", x: 1 }] }, texts: {} };
    const next: Saved = {
      manual: { a: { "2026-08": 5, "2026-09": 3 } }, excel: {},
      tables: { "AR Historis": [{ Bulan: "2026-09", x: 2 }] }, texts: { "2026-09": { "exec.note": "Halo" } },
    };
    const d = diffSaved(prev, next, new Set(["2026-08"]));
    expect(d.metrics).toEqual([{ month: "2026-09", key: "a", source: "manual", value: 3, label: null }]);
    expect(d.skipped).toEqual(["2026-08"]);
    expect(d.rows).toEqual([{ month: "2026-09", table_name: "AR Historis", rows: [{ Bulan: "2026-09", x: 2 }] }]);
    expect(d.texts).toEqual([{ month: "2026-09", slide_key: "exec.note", text: "Halo" }]);
    const del = diffSaved(next, { ...next, manual: {} }, new Set());
    expect(del.deletes).toEqual([{ month: "2026-08", key: "a", source: "manual" }, { month: "2026-09", key: "a", source: "manual" }]);
    expect(isEmptyDiff(diffSaved(prev, prev, new Set()))).toBe(true);
  });
});

describe("Riwayat Excel untuk slide penjualan (Input baris 6–42)", () => {
  it("kunci penjualan: excel menang atas raw di bulan yang punya excel; bulan lain tetap raw", () => {
    const l = layersFrom([
      { month: "2026-04", key: "amt_all:0", source: "excel", value: 135 },
      { month: "2026-04", key: "amt_all:0", source: "raw", value: 0.07 },
      { month: "2026-04", key: "open", source: "excel", value: 1 },
      { month: "2026-04", key: "open", source: "raw", value: 2 },
      { month: "2026-04", key: "cnt_res:2", source: "manual", value: 9 },
    ], { "amt_all:0": { "2026-09": 50 }, "bp_res:1": { "2026-04": 3 } }, {});
    expect(l.raw["amt_all:0"]).toEqual({ "2026-09": 50 });   // Apr dari excel, Sep tetap raw
    expect(l.raw.open).toEqual({ "2026-04": 2 });              // seri non-penjualan: raw tetap menang
    expect(l.raw["bp_res:1"]).toEqual({ "2026-04": 3 });       // tanpa excel bulan itu: raw dipakai
    expect(l.manual["cnt_res:2"]).toEqual({ "2026-04": 9 });   // manual tetap di atas semuanya
  });
  it("pola kunci baris 6–42", () => {
    for (const k of ["sales", "sales_hist", "amt_all:0", "cnt_trad:2", "amt_res:1", "bp_res:2"]) expect(SALES_HISTORY_KEY.test(k)).toBe(true);
    for (const k of ["open", "aging:0", "s7_amt:1", "coll_tgt:0", "salesx"]) expect(SALES_HISTORY_KEY.test(k)).toBe(false);
  });
});

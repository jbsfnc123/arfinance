import { describe, expect, it } from "vitest";
import { buildNoteGroups, filterGroups, type NoteLatest } from "./note-groups";

const note = (p: Partial<NoteLatest>): NoteLatest => ({
  id: 1, invoice_no: "INV", kategori: "Case", business_partner: "Toko A", isi: "retur", collection_name: "Andi",
  invoice_date: "2026-09-01", no_po: null, no_sj: null, done: false, closed_by: null, closed_at: null,
  created_at: null, nominal: 100, ...p,
});

describe("buildNoteGroups", () => {
  const groups = buildNoteGroups([
    note({ id: 1, invoice_no: "A", invoice_date: "2026-08-10", done: true, closed_by: "Rina" }),
    note({ id: 5, invoice_no: "B", collection_name: "Budi", nominal: 250 }),
    note({ id: 3, invoice_no: "C", isi: "harga beda", business_partner: " " }),
  ], "2026-09");

  it("mengelompokkan per kategori + BP + isi, terbaru di atas", () => {
    expect(groups.map((g) => [g.bp, g.isi, g.items.map((i) => i.invoice_no)])).toEqual([
      ["Toko A", "retur", ["B", "A"]],
      ["Tanpa Partner", "harga beda", ["C"]],
    ]);
  });

  it("status dari catatan terbaru, total nominal, collection, dan lewat bulan", () => {
    expect(groups[0]).toMatchObject({ done: false, nomTotal: 350, collections: ["Budi", "Andi"], lateCount: 1 });
  });

  it("filter status", () => {
    const g = buildNoteGroups([note({ id: 9, done: true })], "2026-09");
    expect(filterGroups(g, "open")).toHaveLength(0);
    expect(filterGroups(g, "done")).toHaveLength(1);
    expect(filterGroups(g, "all")).toHaveLength(1);
  });
});

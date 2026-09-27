import { describe, expect, it } from "vitest";
import { filterOptions } from "./table";

type R = { coll: string; group: string; term: string; name: string };
const rows: R[] = [
  { coll: "Ani", group: "GIAS", term: "Net 30 Days", name: "A" },
  { coll: "Ani", group: "RKM", term: "Net 45 Days", name: "B" },
  { coll: "Budi", group: "GIAS", term: "Net 60 Days", name: "C" },
  { coll: "Budi", group: "", term: "Net 60 Days", name: "D" },
];
const F = [
  { k: "coll" as const, l: "Collection", options: ["Ani", "Budi"] },
  { k: "group" as const, l: "Group", options: ["GIAS", "RKM"] },
  { k: "term" as const, l: "Term", options: ["Net 30 Days", "Net 45 Days", "Net 60 Days"] },
];
const all = () => true;
const opts = (active: Record<string, string>, match: (r: R) => boolean = all) =>
  Object.fromEntries(filterOptions(rows, F, active, match).map((f) => [f.k, f.opts.map((o) => `${o.value}:${o.count}`)]));

describe("filter dinamis LocalTable", () => {
  it("tanpa filter aktif: semua opsi dengan jumlah baris", () => {
    expect(opts({})).toEqual({ coll: ["Ani:2", "Budi:2"], group: ["GIAS:2", "RKM:1"], term: ["Net 30 Days:1", "Net 45 Days:1", "Net 60 Days:2"] });
  });

  it("filter satu menyempitkan filter lain, tidak menyempitkan dirinya sendiri", () => {
    expect(opts({ coll: "Budi" })).toEqual({ coll: ["Ani:2", "Budi:2"], group: ["GIAS:1"], term: ["Net 60 Days:2"] });
    expect(opts({ coll: "Ani", group: "RKM" })).toEqual({ coll: ["Ani:1"], group: ["GIAS:1", "RKM:1"], term: ["Net 45 Days:1"] });
  });

  it("opsi terpilih tetap ada walau 0; pencarian ikut menyaring", () => {
    expect(opts({ coll: "Budi", term: "Net 30 Days" }).term).toEqual(["Net 30 Days:0", "Net 60 Days:2"]);
    expect(opts({}, (r) => r.name === "C")).toEqual({ coll: ["Budi:1"], group: ["GIAS:1"], term: ["Net 60 Days:1"] });
  });
});

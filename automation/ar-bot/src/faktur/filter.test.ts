import { describe, expect, it } from "vitest";
import { checkedAfter, contentDisposition, downloadName, EMPTY_FILTER, filterItems, isFiltered, statusCounts, statusGroup } from "./filter";

const row = (invoice: string, status: string, x: { po?: string; sj?: string; inPo?: boolean; checked?: boolean } = {}) =>
  ({ invoice, faktur: `F-${invoice}`, status, checked: x.checked ?? false, no_po: x.po, no_sj: x.sj, in_po: x.inPo });

const items = [
  row("SI/1", "Ready", { po: "PO1", inPo: true, checked: true }),
  row("SI/2", "Not Found in Draft", { po: "PO1", inPo: true }),
  row("SI/3", "Not Found in Draft (PO)"),
  row("SI/4", "Uploaded & Sent · INV9 (SJ/1)", { po: "PO2", checked: true }),
  row("SI/5", "Data Tidak Cocok", { po: "PO3", sj: "SJ/555" }),
  row("SI/6", "Cocok (uji coba): INV7 (SJ/2)", { po: "PO2", inPo: true }),
];

describe("grup No Invoice Terisi (sheet Invoice)", () => {
  it("status Isi No Invoice dikelompokkan sendiri", () => {
    expect(statusGroup("No Invoice Terisi · INV1 (SJ/1)")).toBe("filled");
    expect(statusGroup("Gagal Simpan: x")).toBe("failed");
    const inv = [{ invoice: "SI/9", status: "No Invoice Terisi · INV1", checked: false, no_po: "PO9", no_sj: "SJ/9" }];
    expect(filterItems(inv, { ...EMPTY_FILTER, status: "filled", q: "po9" })).toHaveLength(1);
  });
});

describe("filter Upload Faktur", () => {
  it("kategori status", () => {
    expect(items.map((i) => statusGroup(i.status))).toEqual(["ready", "not_found", "not_found", "uploaded", "failed", "dry"]);
    expect(statusCounts(items)).toEqual({ ready: 1, not_found: 2, uploaded: 1, failed: 1, dry: 1 });
  });
  it("filter digabung: status, No PO, Excel PO, cari", () => {
    const inv = (f: Partial<typeof EMPTY_FILTER>) => filterItems(items, { ...EMPTY_FILTER, ...f }).map((i) => i.invoice);
    expect(inv({})).toHaveLength(6);
    expect(inv({ status: "not_found" })).toEqual(["SI/2", "SI/3"]);
    expect(inv({ status: "not_found", po: "yes" })).toEqual(["SI/2"]);
    expect(inv({ po: "no" })).toEqual(["SI/3"]);
    expect(inv({ excel: "yes" })).toEqual(["SI/1", "SI/2", "SI/6"]);
    expect(inv({ excel: "no", po: "yes" })).toEqual(["SI/4", "SI/5"]);
    expect(inv({ q: "sj/555" })).toEqual(["SI/5"]);
    expect(inv({ q: "po2 uji" })).toEqual(["SI/6"]);
    expect(isFiltered(EMPTY_FILTER)).toBe(false);
    expect(isFiltered({ ...EMPTY_FILTER, q: "  " })).toBe(false);
  });
  it("centang per filter menjaga centang di luar filter (tambah/hapus)", () => {
    const vis = filterItems(items, { ...EMPTY_FILTER, status: "not_found" });
    expect(checkedAfter(items, vis, "add")).toEqual(["SI/1", "SI/2", "SI/3", "SI/4"]);
    expect(checkedAfter(items, filterItems(items, { ...EMPTY_FILTER, po: "yes" }), "remove")).toEqual([]);
    expect(checkedAfter(items, filterItems(items, { ...EMPTY_FILTER, status: "ready" }), "remove")).toEqual(["SI/4"]);
    expect(checkedAfter(items, vis, "only")).toEqual(["SI/2", "SI/3"]);
  });
  it("nama unduhan = No Faktur", () => {
    expect(downloadName("04002600406834651", "x.pdf")).toBe("04002600406834651.pdf");
    expect(downloadName("", "04002600406834651.pdf")).toBe("04002600406834651.pdf");
    expect(downloadName('a/b:"c', "x.pdf")).toBe("abc.pdf");
    expect(contentDisposition("04002600406834651.pdf")).toBe(`inline; filename="04002600406834651.pdf"; filename*=UTF-8''04002600406834651.pdf`);
    expect(contentDisposition("1.pdf", true)).toMatch(/^attachment;/);
  });
});

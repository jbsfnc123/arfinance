// @vitest-environment happy-dom
// Kotak Cari LocalTable (perbaikan INP): huruf tampil seketika & tidak hilang saat mengetik cepat, penyaringan menyusul
// lewat transisi, kata cari diingat di sessionStorage dan dipulihkan saat tabel dibuka lagi.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, getItemKey }: { count: number; getItemKey: (i: number) => string | number }) => ({
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: getItemKey(index), start: index * 34, end: (index + 1) * 34 })),
    getTotalSize: () => count * 34, measure: () => {}, measureElement: () => {},
  }),
}));

import { LocalTable, type LCol } from "./table";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type Row = { id: number; bp: string; sj: string };
const ROWS: Row[] = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, bp: i % 2 ? `Toko Maju ${i}` : `Anyar ${i}`, sj: `SJ/${1000 + i}` }));
const COLS: LCol<Row>[] = [{ k: "bp", l: "BP" }, { k: "sj", l: "SJ" }];

let host: HTMLDivElement, root: Root;
beforeEach(() => { sessionStorage.clear(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const render = () => act(() => root.render(<LocalTable title="T" rows={ROWS} cols={COLS} rowKey={(r) => r.id} stateKey="cari" search={["bp", "sj"]} />));
const box = () => host.querySelector<HTMLInputElement>("input[aria-label='Cari di T']")!;
const count = () => host.querySelectorAll("tbody tr[data-index]").length;
const type = (v: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(box(), v);
  box().dispatchEvent(new Event("input", { bubbles: true }));
};

describe("kotak Cari LocalTable", () => {
  it("mengetik cepat: semua huruf tetap ada, hasil sesuai kata terakhir", async () => {
    render();
    expect(count()).toBe(50);
    await act(async () => { for (const v of ["t", "to", "tok", "toko", "toko m", "toko maju 1"]) type(v); });
    expect(box().value).toBe("toko maju 1");
    // Toko Maju 1, 11, 13, …, 19 (ganjil yang diawali 1)
    expect(count()).toBe(ROWS.filter((r) => r.bp.toLowerCase().includes("toko maju 1")).length);
  });

  it("kata cari diingat & dipulihkan saat tabel dibuka lagi; mengosongkan menampilkan semua", async () => {
    render();
    await act(async () => { type("sj/101"); });
    expect(count()).toBe(10);
    expect(sessionStorage.getItem("view:table:cari:q")).toBe('"sj/101"');
    act(() => root.unmount());
    root = createRoot(host);
    render();
    expect(box().value).toBe("sj/101");
    expect(count()).toBe(10);
    await act(async () => { type(""); });
    expect(count()).toBe(50);
  });
});

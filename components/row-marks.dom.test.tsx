// @vitest-environment happy-dom
// Penanda warna baris: LocalTable (identitas record, prioritas terpilih, target di luar filter), RowMarkButton
// (centang/Campuran/Hapus, keyboard), dan commitMarks (konfirmasi server, pemulihan saat gagal, respons lama).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

// Virtualizer di happy-dom tidak punya ukuran layout → render semua baris (logika warna tetap sama).
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, getItemKey }: { count: number; getItemKey: (i: number) => string | number }) => ({
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: getItemKey(index), start: index * 34, end: (index + 1) * 34 })),
    getTotalSize: () => count * 34, measure: () => {}, measureElement: () => {},
  }),
}));
const store = vi.hoisted(() => ({ patchLocal: vi.fn(), ensure: vi.fn(async () => {}) }));
vi.mock("@/lib/local/store", () => ({ patchLocal: store.patchLocal, ensure: store.ensure, useDataset: () => ({ data: null }) }));

import { LocalTable, type LCol } from "@/lib/local/table";
import { RowMarkButton } from "./row-mark-button";
import { commitMarks } from "@/lib/ui/use-row-marks";
import type { RowMarkColor } from "@/lib/modules/row-marks";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type Row = { id: number; bp: string; open_amt: number };
const ROWS: Row[] = [{ id: 11, bp: "Beta", open_amt: 300 }, { id: 7, bp: "Alfa", open_amt: 100 }, { id: 42, bp: "Gama", open_amt: 200 }];
const COLS: LCol<Row>[] = [{ k: "bp", l: "BP" }, { k: "open_amt", l: "Nominal", n: true }];

let host: HTMLDivElement, root: Root;
beforeEach(() => { sessionStorage.clear(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllMocks(); });
const trs = () => [...host.querySelectorAll<HTMLTableRowElement>("tbody tr[data-index]")];
const markOf = (bp: string) => trs().find((t) => t.textContent?.includes(bp))?.getAttribute("data-mark") ?? null;

describe("LocalTable: penanda warna dari identitas record", () => {
  it("tanpa prop rowMark tidak ada data-mark (pemakai lain tidak berubah)", () => {
    act(() => root.render(<LocalTable title="T" rows={ROWS} cols={COLS} rowKey={(r) => r.id} stateKey="t1" search={["bp"]} />));
    expect(trs().length).toBe(3);
    expect(trs().some((t) => t.hasAttribute("data-mark"))).toBe(false);
  });

  it("warna mengikuti id setelah urutan berubah; baris terpilih memberi data-selected dan tetap bertanda", () => {
    const marks = new Map<number, RowMarkColor>([[7, "mint"], [42, "lavender"]]);
    act(() => root.render(<LocalTable title="T" rows={ROWS} cols={COLS} rowKey={(r) => r.id} stateKey="t2" search={["bp"]} selectable rowMark={(r) => marks.get(r.id)} />));
    expect([markOf("Alfa"), markOf("Beta"), markOf("Gama")]).toEqual(["mint", null, "lavender"]);
    act(() => { host.querySelector<HTMLButtonElement>("button[aria-label='Urutkan menurut Nominal']")!.click(); });
    expect(trs().map((t) => t.textContent?.match(/Alfa|Beta|Gama/)?.[0])).toEqual(["Alfa", "Gama", "Beta"]);
    expect([markOf("Alfa"), markOf("Beta"), markOf("Gama")]).toEqual(["mint", null, "lavender"]);
    const cb = trs()[0].querySelector<HTMLInputElement>("input[type=checkbox]")!;
    act(() => { cb.click(); });
    expect(trs()[0].getAttribute("data-selected")).toBe("true");
    expect(trs()[0].getAttribute("data-mark")).toBe("mint");
  });

  it("aksi menerima target terpilih termasuk yang tersembunyi oleh pencarian + jumlahnya", () => {
    const seen: { ids: number[]; hidden: number }[] = [];
    act(() => root.render(<LocalTable title="T" rows={ROWS} cols={COLS} rowKey={(r) => r.id} stateKey="t3" selectable search={["bp"]}
      actions={(sel, _c, info) => { seen.push({ ids: sel.map((r) => r.id), hidden: info.hidden }); return null; }} />));
    act(() => { host.querySelector<HTMLInputElement>("thead input[type=checkbox]")!.click(); }); // pilih semua (3)
    const search = host.querySelector<HTMLInputElement>("input[aria-label='Cari di T']")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "Alfa");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(trs().length).toBe(1);
    expect(seen.at(-1)).toEqual({ ids: [11, 7, 42], hidden: 2 });
  });
});

describe("LocalTable: badge status bertanda data-badge", () => {
  it("kolom badge merender data-badge di baris bertanda maupun tidak", () => {
    type B = { id: number; gr: string };
    const rows: B[] = [{ id: 1, gr: "Done" }, { id: 2, gr: "Pending" }];
    const marks = new Map<number, RowMarkColor>([[1, "blue"]]);
    act(() => root.render(<LocalTable title="B" rows={rows} cols={[{ k: "gr", l: "GR", badge: { Done: "bg-success/20 text-success", Pending: "bg-warning/20 text-warning" } }]}
      rowKey={(r) => r.id} stateKey="t4" search={["gr"]} rowMark={(r) => marks.get(r.id)} />));
    const badges = [...host.querySelectorAll<HTMLElement>("[data-badge]")];
    expect(badges.map((b) => [b.textContent, b.closest("tr")!.getAttribute("data-mark")])).toEqual([["Done", "blue"], ["Pending", null]]);
    expect(badges[0].className).toContain("text-success"); // kelas status tidak berubah; kontras diatur CSS khusus tr[data-mark]
  });
});

describe("RowMarkButton", () => {
  function Harness({ ids, marks, hidden = 0 }: { ids: number[]; marks: Map<number, RowMarkColor>; hidden?: number }) {
    const [last, setLast] = useState<string>("-");
    return (<><RowMarkButton ids={ids} hidden={hidden} marks={marks} onApply={(c) => setLast(String(c))} /><output>{last}</output></>);
  }
  const open = () => act(() => { [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Warna baris"))!.click(); });
  const radios = () => [...host.querySelectorAll<HTMLElement>("[role=menuitemradio]")];

  it("semua satu warna → centang di warna itu; fokus awal di sana", () => {
    act(() => root.render(<Harness ids={[1, 2]} marks={new Map([[1, "mint"], [2, "mint"]])} />));
    open();
    expect(radios().map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(document.activeElement?.textContent).toContain("Mint");
  });

  it("warna berbeda → Campuran tanpa centang; jumlah di luar filter tampil", () => {
    act(() => root.render(<Harness ids={[1, 2, 3]} hidden={2} marks={new Map([[1, "mint"], [2, "blue"]])} />));
    expect(host.textContent).toContain("Campuran");
    expect(host.textContent).toContain("3 baris dipilih · 2 di luar filter");
    open();
    expect(radios().every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
  });

  it("pilih warna & Hapus warna memanggil onApply lalu menutup; tanpa warna → Hapus nonaktif", () => {
    act(() => root.render(<Harness ids={[1]} marks={new Map()} />));
    open();
    const hapus = [...host.querySelectorAll<HTMLButtonElement>("[role=menuitem]")].find((b) => b.textContent?.includes("Hapus warna"))!;
    expect(hapus.disabled).toBe(true);
    act(() => { radios()[2].click(); });
    expect(host.querySelector("output")!.textContent).toBe("lavender");
    expect(host.querySelector("[role=menu]")).toBeNull();
  });

  it("panah bawah berpindah pilihan; Escape menutup & fokus kembali ke tombol", () => {
    act(() => root.render(<Harness ids={[1]} marks={new Map([[1, "blue"]])} />));
    const trigger = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes("Warna baris"))!;
    trigger.focus();
    open();
    const key = (k: string) => act(() => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); });
    key("ArrowDown");
    expect(document.activeElement?.textContent).toContain("Mint");
    key("End");
    expect(document.activeElement?.textContent).toContain("Hapus warna");
    key("Escape");
    expect(host.querySelector("[role=menu]")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("commitMarks: konfirmasi server, pemulihan, respons lama", () => {
  it("sukses → pesan 'Warna tersimpan' hanya setelah server menjawab", async () => {
    let resolve!: (v: { error: null }) => void;
    const notify = vi.fn();
    const p = commitMarks({ module: "m10", ids: [1, 2], color: "blue", notify, rpc: () => new Promise((r) => { resolve = r; }) });
    expect(store.patchLocal).toHaveBeenCalledTimes(1); // tampilan diperbarui segera
    expect(notify).not.toHaveBeenCalled();
    resolve({ error: null });
    expect(await p).toBe(true);
    expect(notify).toHaveBeenCalledWith("Warna tersimpan: Biru untuk 2 baris", "success");
  });

  it("gagal (akses ditolak) → muat ulang dari server + pesan akses, tanpa 'tersimpan'", async () => {
    const notify = vi.fn();
    const ok = await commitMarks({ module: "rkm", ids: [5], color: "mint", notify, rpc: async () => ({ error: { code: "42501", message: "Akses ditolak" } }) });
    expect(ok).toBe(false);
    expect(store.ensure).toHaveBeenCalledWith("rkmMarks", { force: true });
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/tidak punya akses/), "danger");
    expect(notify).not.toHaveBeenCalledWith(expect.stringMatching(/tersimpan/), "success");
  });

  it("jaringan putus (rpc melempar) → pulih + pesan koneksi", async () => {
    const notify = vi.fn();
    expect(await commitMarks({ module: "m10", ids: [1], color: null, notify, rpc: async () => { throw new Error("Failed to fetch"); } })).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/Periksa koneksi/), "danger");
  });

  it("respons request lama tidak menimpa pilihan terbaru", async () => {
    const notify = vi.fn();
    let first!: (v: { error: { code: string } }) => void;
    const p1 = commitMarks({ module: "m10", ids: [1], color: "blue", notify, rpc: () => new Promise((r) => { first = r; }) });
    const p2 = commitMarks({ module: "m10", ids: [1], color: "lavender", notify, rpc: async () => ({ error: null }) });
    await p2;
    first({ error: { code: "42501" } }); // request lama gagal SETELAH yang baru sukses
    await p1;
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("Warna tersimpan: Lavender untuk 1 baris", "success");
    expect(store.ensure).toHaveBeenCalledTimes(1); // hanya sinkron dari request terbaru; kegagalan lama tidak memulihkan
  });
});

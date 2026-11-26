// @vitest-environment happy-dom
// Fase 92: MultiSelectFilter (Jadwal Bayar Kertas Kerja Mitra10) — Pilih semua, centang > 1, normalisasi ke null, cari.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MultiSelectFilter, nextSelection, type MultiOption } from "./multi-select-filter";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const OPTS: MultiOption[] = [
  { value: "2026-11-05", label: "05/11/2026", count: 3 },
  { value: "2026-11-20", label: "20/11/2026", count: 2 },
  { value: "2026-12-01", label: "01/12/2026", count: 4 },
  { value: "", label: "(Tanpa Jadwal)", count: 1 },
];

let host: HTMLDivElement, root: Root;
let last: string[] | null | undefined;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); last = undefined; });
afterEach(() => { act(() => root.unmount()); host.remove(); });

function Harness({ init = null }: { init?: string[] | null }) {
  const [sel, setSel] = useState<string[] | null>(init);
  return <MultiSelectFilter label="Jadwal Bayar" unit="tanggal" options={OPTS} selected={sel} onChange={(v) => { last = v; setSel(v); }} />;
}
const trigger = () => host.querySelector<HTMLButtonElement>('button[aria-label="Filter Jadwal Bayar"]')!;
const box = (name: string) => [...document.querySelectorAll("label")].find((l) => l.textContent?.includes(name))!.querySelector("input")!;
const click = (el: HTMLElement) => act(() => { el.click(); });

describe("nextSelection", () => {
  const all = OPTS.map((o) => o.value);
  it("melepas satu dari 'semua' → daftar sisanya", () => expect(nextSelection(all, null, "", false)).toEqual(["2026-11-05", "2026-11-20", "2026-12-01"]));
  it("mencentang yang terakhir hilang → kembali null", () => expect(nextSelection(all, ["2026-11-05", "2026-11-20", "2026-12-01"], "", true)).toBeNull());
});

describe("MultiSelectFilter", () => {
  it("bawaan Semua; Pilih semua dilepas → []; dicentang → null", () => {
    act(() => root.render(<Harness />));
    expect(trigger().textContent).toContain("Semua");
    click(trigger());
    expect(box("Pilih semua").checked).toBe(true);
    click(box("Pilih semua"));
    expect(last).toEqual([]);
    expect(trigger().textContent).toContain("Tidak ada");
    click(box("Pilih semua"));
    expect(last).toBeNull();
  });

  it("centang 2 tanggal → array 2; ringkasan '2 tanggal'; Pilih semua indeterminate", () => {
    act(() => root.render(<Harness init={[]} />));
    click(trigger());
    click(box("05/11/2026"));
    expect(trigger().textContent).toContain("05/11/2026");
    click(box("01/12/2026"));
    expect(last).toEqual(["2026-11-05", "2026-12-01"]);
    expect(trigger().textContent).toContain("2 tanggal");
    expect(box("Pilih semua").indeterminate).toBe(true);
  });

  it("semua dicentang satu per satu → dinormalkan ke null; Reset → null", () => {
    act(() => root.render(<Harness init={["2026-11-05"]} />));
    click(trigger());
    for (const l of ["20/11/2026", "01/12/2026", "(Tanpa Jadwal)"]) click(box(l));
    expect(last).toBeNull();
    act(() => root.render(<Harness init={["2026-11-05"]} key="b" />));
    click(trigger());
    click([...document.querySelectorAll("button")].find((b) => b.textContent === "Reset")!);
    expect(last).toBeNull();
  });

  it("cari menyaring daftar", () => {
    act(() => root.render(<Harness />));
    click(trigger());
    const q = document.querySelector<HTMLInputElement>('input[aria-label="Cari Jadwal Bayar"]')!;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(q, "11/2026"); q.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const items = [...document.querySelectorAll('[aria-label="Daftar Jadwal Bayar"] label')].map((l) => l.textContent);
    expect(items).toEqual(["05/11/20263", "20/11/20262"]);
  });
});

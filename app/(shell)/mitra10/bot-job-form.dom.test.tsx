// @vitest-environment happy-dom
// Fase 93: BotJobForm (tab BOT / popover Kertas Kerja) — Uji Coba tanpa konfirmasi, Jalankan job tulis wajib konfirmasi,
// akun terpilih ikut param, tombol terkunci saat ada run aktif. LocalTable exportExtra: tercentang vs semua baris tampil.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, getItemKey }: { count: number; getItemKey: (i: number) => string | number }) => ({
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: getItemKey(index), start: index * 34, end: (index + 1) * 34 })),
    getTotalSize: () => count * 34, measure: () => {}, measureElement: () => {},
  }),
}));
vi.mock("@/lib/local/store", () => ({ patchLocal: vi.fn(), ensure: vi.fn(async () => {}), useDataset: () => ({ data: null }) }));

import { BotJobForm } from "./bot-job-form";
import type { Bot } from "./use-bot";
import { LocalTable } from "@/lib/local/table";
import type { BotRun } from "@/lib/modules/m10/bot";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement, root: Root;
beforeEach(() => { sessionStorage.clear(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const mkBot = (o: Partial<Bot> = {}) => ({
  runs: [] as BotRun[], active: null, loaded: true, error: null, busy: false,
  request: vi.fn(async () => 7), cancel: vi.fn(), reload: vi.fn(), ...o,
}) as unknown as Bot & { request: ReturnType<typeof vi.fn> };
const btn = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(label))!;
const click = async (el: HTMLElement) => { await act(async () => { el.click(); }); };

describe("BotJobForm", () => {
  it("Uji Coba langsung dikirim (dry run) tanpa konfirmasi", async () => {
    const bot = mkBot();
    act(() => root.render(<BotJobForm id="edi.gr" bot={bot} users={["U1", "U2"]} />));
    await click(btn("Uji Coba"));
    expect(bot.request).toHaveBeenCalledTimes(1);
    const req = bot.request.mock.calls[0][0];
    expect(req.dryRun).toBe(true);
    expect(req.jobs[0].id).toBe("edi.gr");
    expect(req.jobs[0].params.accounts).toBeUndefined();
    expect(req.jobs[0].params.push).toBe(true);
  });

  it("job baca (Receiving) Jalankan tanpa konfirmasi; akun terpilih ikut", async () => {
    const bot = mkBot();
    act(() => root.render(<BotJobForm id="edi.kwitansi" bot={bot} users={["U1", "U2"]} />));
    await click(btn("U2"));
    await click(btn("Jalankan"));
    expect(bot.request.mock.calls[0][0]).toMatchObject({ dryRun: false, jobs: [{ id: "edi.kwitansi", params: { accounts: ["U2"] } }] });
  });

  it("job tulis (Outbox) Jalankan → konfirmasi dulu", async () => {
    const bot = mkBot();
    act(() => root.render(<BotJobForm id="edi.outbox-invoice" bot={bot} users={[]} />));
    await click(btn("Jalankan"));
    expect(bot.request).not.toHaveBeenCalled();
    expect(document.body.textContent).toMatch(/Create Kuitansi/);
    const dlg = document.querySelector('[role="dialog"]')!;
    await click([...dlg.querySelectorAll("button")].find((b) => b.textContent === "Jalankan")!);
    expect(bot.request.mock.calls[0][0]).toMatchObject({ dryRun: false, jobs: [{ id: "edi.outbox-invoice" }] });
  });

  it("compact (popover): konfirmasi di tempat", async () => {
    const bot = mkBot();
    act(() => root.render(<BotJobForm id="edi.invoice-inbox" bot={bot} users={[]} compact />));
    await click(btn("Jalankan"));
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    await click(btn("Ya, jalankan"));
    expect(bot.request).toHaveBeenCalledTimes(1);
  });

  it("ada run aktif → tombol terkunci", () => {
    const active = { id: 9, status: "running" } as BotRun;
    act(() => root.render(<BotJobForm id="edi.gr" bot={mkBot({ active, runs: [] })} users={[]} />));
    expect(btn("Uji Coba").disabled).toBe(true);
    expect(btn("Jalankan").disabled).toBe(true);
    expect(document.body.textContent).toMatch(/Run #9 sedang berjalan/);
  });
});

describe("LocalTable exportExtra", () => {
  type Row = { id: number; inv: string };
  const ROWS: Row[] = [{ id: 1, inv: "A" }, { id: 2, inv: "B" }, { id: 3, inv: "C" }];
  it("menerima baris tercentang & semua baris tampil; dirender sebelum tombol Excel", async () => {
    const seen: [number, number][] = [];
    act(() => root.render(<LocalTable title="T" stateKey="xt" rows={ROWS} cols={[{ k: "inv", l: "Inv" }]} rowKey={(r) => r.id} selectable search={["inv"]}
      exportExtra={(sel, shown) => { seen.push([sel.length, shown.length]); return <button type="button">Import to BOT</button>; }} />));
    expect(seen.at(-1)).toEqual([0, 3]);
    const btns = [...host.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(btns.indexOf("Import to BOT")).toBe(btns.findIndex((t) => t === "Excel") - 1);
    await click(host.querySelector<HTMLInputElement>('tbody input[type="checkbox"]')!);
    expect(seen.at(-1)).toEqual([1, 3]);
  });
});

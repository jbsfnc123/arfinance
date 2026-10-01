// @vitest-environment happy-dom
// Monitor Surat Jalan (Fase 46): daftar = SJ aging terbaru; upload hanya mengirim SJ yang cocok aging & belum punya
// Receive Date (baris pertama dengan Receiver diakui); kontrol tulis per peran; rata-rata "—"; gagal = tidak ada hasil palsu.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Datasets } from "@/lib/local/datasets";
import type { SjAging, SjReceipt } from "@/lib/modules/sj/compute";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, getItemKey }: { count: number; getItemKey: (i: number) => string | number }) => ({
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: getItemKey(index), start: index * 34, end: (index + 1) * 34 })),
    getTotalSize: () => count * 34, measure: () => {}, measureElement: () => {},
  }),
}));
vi.mock("@/components/chart", () => ({ Chart: () => <div data-chart /> }));
const h = vi.hoisted(() => ({ data: null as Datasets["sj"] | null, loading: false, reload: vi.fn(async () => {}), rpc: vi.fn() }));
vi.mock("@/lib/local/store", () => ({ useDataset: () => ({ data: h.data, loading: h.loading, error: null, reload: h.reload }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc: h.rpc }) }));
vi.mock("@/lib/parsers/date", async (orig) => ({ ...(await orig<typeof import("@/lib/parsers/date")>()), todayJakarta: () => "2026-09-30" }));

import { SjView } from "./sj-view";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ag = (sj_key: string, invoice_date: string): SjAging => ({ sj_key, invoice_date, invoice_no: `INV-${sj_key}`, business_partner: "Toko A", area: "Jakarta", invoices: 1 });
const rc = (sj_key: string, receive_date: string, receiver: string): SjReceipt => ({ sj_key, sj_no: sj_key, receive_date, receiver, file_name: "a.csv", recorded_at: "2026-09-30T01:00:00Z" });
const base = (o: Partial<Datasets["sj"]> = {}): Datasets["sj"] => ({
  aging: [ag("SJ/1", "2026-09-01"), ag("SJ/2", "2026-09-03"), ag("TEST/3", "2026-09-05")],
  receipts: [rc("SJ/1", "2026-09-04", "Wienda Aswar")],
  receivers: [{ id: 1, name: "Bintang Anugia Arragi", active: true }, { id: 2, name: "Wienda Aswar", active: true }],
  log: [], uploads: [{ at: "2026-09-30T02:00:00Z", file_name: "lama.csv", rows: 1, uploader: "Mando" }],
  agingAt: { month: "2026-09", at: "2026-09-30T01:00:00Z" }, canManage: false, ...o,
});

let host: HTMLDivElement, root: Root;
beforeEach(() => { sessionStorage.clear(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllMocks(); });
const tab = (label: string) => act(() => { [...host.querySelectorAll<HTMLButtonElement>("[role=tab]")].find((b) => b.textContent?.includes(label))!.click(); });
const text = () => host.textContent ?? "";
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
const btn = (start: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith(start));

describe("Monitor Surat Jalan — tampilan", () => {
  it("Dashboard dari SJ aging: KPI = baris Kertas Kerja, durasi dari Invoice Date, periode tampil", () => {
    h.data = base();
    act(() => root.render(<SjView />));
    expect(text()).toContain("Periode Invoice Date: 01/09/2026 – 30/09/2026 (bulan terbaru)");
    expect(text()).toContain("SJ di Aging3");
    expect(text()).toContain("3,0 hari"); // SJ/1: Invoice 1 Sep → Receive 4 Sep
    expect(text()).toContain("Aging September 2026");
    tab("Kertas Kerja");
    expect(host.querySelectorAll("tbody tr[data-index]").length).toBe(3);
    expect(text()).toContain("Sudah diterima");
    expect(text()).toContain("Belum diterima");
  });

  it("Kertas Kerja: kolom default sesuai permintaan; filter Marketing & Payment Group (tanpa Area) mengubah KPI", () => {
    h.data = base({ aging: [
      { ...ag("SJ/1", "2026-09-01"), marketing: "01-Trad", payment_group: "PG1" },
      { ...ag("SJ/2", "2026-09-03"), marketing: "02-Modern", payment_group: "PG2" },
      { ...ag("TEST/3", "2026-09-05"), marketing: "02-Modern", payment_group: "PG3" },
    ] });
    act(() => root.render(<SjView />));
    expect(host.querySelector("select[aria-label='Area']")).toBeNull();
    const mk = host.querySelector<HTMLSelectElement>("select[aria-label='Marketing']")!;
    expect([...mk.options].map((o) => o.textContent)).toEqual(["Marketing: semua (2)", "01-Trad (1)", "02-Modern (2)"]);
    act(() => { mk.value = "02-Modern"; mk.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(text()).toContain("SJ di Aging2");
    const pg = host.querySelector<HTMLSelectElement>("select[aria-label='Payment Group']")!;
    expect([...pg.options].map((o) => o.value)).toEqual(["", "PG2", "PG3"]); // dinamis: hanya PG milik 02-Modern
    expect(text()).toContain("Per Marketing");
    expect(text()).not.toContain("10 SJ belum diterima terlama");
    tab("Kertas Kerja");
    const heads = [...host.querySelectorAll("thead th")].map((t) => t.textContent?.trim()).filter(Boolean);
    expect(heads.slice(0, 7).join("|")).toMatch(/^SJ No\..*Invoice No.*Invoice Date.*Business Partner.*Status.*Receiver.*Receive Date/);
    expect(heads.some((h2) => /^(Area|Marketing|Payment Group|Penanda)/.test(h2!))).toBe(false);
  });

  it("tanpa penerimaan: rata-rata '—' dan ajakan upload, bukan angka 0", () => {
    h.data = base({ receipts: [], canManage: true });
    act(() => root.render(<SjView />));
    expect(text()).toContain("Belum ada data penerimaan");
    const kpi = [...host.querySelectorAll("div")].find((d) => d.firstElementChild?.textContent === "Rata-rata waktu penerimaan");
    expect(kpi?.textContent).toContain("—");
    expect(kpi?.textContent).not.toContain("0 hari");
  });

  it("aging kosong: pesan jelas", () => {
    h.data = base({ aging: [], receipts: [] });
    act(() => root.render(<SjView />));
    expect(text()).toContain("Aging belum ada");
  });

  it("non-Controller: upload & pengaturan Receiver nonaktif dengan penjelasan", () => {
    h.data = base({ canManage: false });
    act(() => root.render(<SjView />));
    tab("Upload & Setting");
    expect(host.querySelector<HTMLInputElement>("input[type=file]")!.disabled).toBe(true);
    expect(text()).toContain("hanya untuk Controller dan Super Admin");
    expect(host.querySelector("input[placeholder='Nama Receiver baru']")).toBeNull();
  });

  it("saat data belum termuat: 'Memuat', bukan pesan tidak berhak", () => {
    h.data = null; h.loading = true;
    act(() => root.render(<SjView />));
    tab("Upload & Setting");
    expect(text()).toContain("Memuat data & hak akses");
    expect(text()).not.toContain("hanya untuk Controller dan Super Admin");
    h.loading = false;
  });
});

describe("Monitor Surat Jalan — upload", () => {
  const HEAD = "Area,SJ No.,Tanggal SJ,Business Partner,Locator,Send Date,Sender,Receive Date,Receiver,Jumlah Hari,Faktur,Description,No. Route,Shipper 1,No. Plat,Driver,Shipper 2,Send Receipt Doc No";
  const L = (sj: string, rdate: string, recv: string) => `Jakarta,${sj},01 Sep 2026,Toko A,L1,02 Sep 2026,Siti,${rdate},${recv},-,Ya,,R1,PT X,B 1,Budi,,1`;
  const CSV = [HEAD,
    L("SJ/1", "05 Sep 2026", "Bintang Anugia Arragi"),   // sudah punya Receive Date → dilewati
    L("sj/2", "-", "-"),
    L("SJ/2", "06 Sep 2026", "Marselia Angelia"),         // tidak diakui
    L("SJ/2", "07 Sep 2026", "Wienda Aswar"),             // ← disimpan
    L("TEST/3", "08 Sep 2026", "Bintang Anugia Arragi"),  // ← disimpan
    L("SJ/99", "08 Sep 2026", "Wienda Aswar"),            // tidak ada di aging
  ].join("\n");
  const pickFile = async () => {
    const input = host.querySelector<HTMLInputElement>("input[type=file]")!;
    Object.defineProperty(input, "files", { value: [new File([CSV], "uji.csv", { type: "text/csv" })], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await flush();
  };

  it("pratinjau relasi aging → kirim hanya SJ aging tanpa Receive Date; hasil dari server", async () => {
    h.data = base({ canManage: true });
    h.rpc.mockResolvedValue({ data: { sent: 2, saved: 2, existing: 0, notInAging: 0, notRecognized: 0, badDate: 0 }, error: null });
    act(() => root.render(<SjView />));
    tab("Upload & Setting");
    await pickFile();
    expect(text()).toContain("SJ dengan penerimaan diakui4");
    expect(text()).toContain("· tidak ada di Aging (dilewati)1");
    expect(text()).toContain("· sudah punya Receive Date (dilewati)1");
    expect(text()).toContain("Akan disimpan2");
    expect(text()).toContain("Marselia Angelia — 1 baris");
    await act(async () => { btn("Simpan 2 Receive Date")!.click(); });
    await flush();
    const [fn, args] = h.rpc.mock.calls[0];
    expect(fn).toBe("sj_receipts_apply");
    expect(args.p_file_name).toBe("uji.csv");
    expect(args.p_rows).toEqual([
      { sj_key: "SJ/2", sj_no: "SJ/2", receive_date: "2026-09-07", receiver: "Wienda Aswar" },
      { sj_key: "TEST/3", sj_no: "TEST/3", receive_date: "2026-09-08", receiver: "Bintang Anugia Arragi" },
    ]);
    expect(text()).toContain("Hasil upload (dikonfirmasi server)");
    expect(text()).toContain("Receive Date disimpan2");
    expect(h.reload).toHaveBeenCalled();
  });

  it("gagal: pesan jelas, tidak ada hasil 'berhasil', bisa diulang", async () => {
    h.data = base({ canManage: true });
    h.rpc.mockResolvedValue({ data: null, error: { message: "koneksi terputus" } });
    act(() => root.render(<SjView />));
    tab("Upload & Setting");
    await pickFile();
    await act(async () => { btn("Simpan 2")!.click(); });
    await flush();
    expect(text()).toContain("Upload gagal, tidak ada data yang tersimpan: koneksi terputus");
    expect(text()).not.toContain("Hasil upload");
    expect(btn("Simpan 2")!.disabled).toBe(false);
  });

  it("Receiver: duplikat ternormalisasi ditolak; pratinjau dampak (menonaktifkan Wienda mengubah 1 SJ)", async () => {
    h.data = base({ canManage: true });
    h.rpc.mockResolvedValue({ data: { id: 2, name: "Wienda Aswar" }, error: null });
    act(() => root.render(<SjView />));
    tab("Upload & Setting");
    const input = host.querySelector<HTMLInputElement>("input[placeholder='Nama Receiver baru']")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "  WIENDA   aswar ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(text()).toContain('Nama "Wienda Aswar" sudah ada di daftar');
    const li = [...host.querySelectorAll("li")].find((x) => x.textContent?.startsWith("Wienda Aswar"))!;
    act(() => { [...li.querySelectorAll("button")].find((b) => b.textContent === "Nonaktifkan…")!.click(); });
    expect(document.body.textContent).toContain("1 SJ berubah status");
    await act(async () => { [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Simpan perubahan")!.click(); });
    await flush();
    expect(h.rpc).toHaveBeenCalledWith("sj_receiver_save", { p_id: 2, p_name: "Wienda Aswar", p_active: false });
  });
});

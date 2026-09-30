// @vitest-environment happy-dom
// Monitor Surat Jalan: tiga tab (Dashboard / Kertas Kerja / Upload & Setting), kontrol tulis per peran, rata-rata "—",
// alur upload (pratinjau → potongan → commit → hasil dari server) dan gagal di tengah (tidak ada hasil palsu).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Datasets } from "@/lib/local/datasets";
import type { SjEvent } from "@/lib/modules/sj/compute";

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
let id = 1;
const ev = (sj: string, receiver: string | null, receive: string | null, o: Partial<SjEvent> = {}): SjEvent => ({
  id: id++, seq: 1, row_no: id, batch_id: 1, sj_no: sj, sj_key: sj.toUpperCase(), area: "Jakarta", tanggal_sj: "2026-09-01",
  tanggal_sj_raw: "01 Sep 2026", business_partner: "Toko A", locator: "L1", send_date: null, sender: null, receive_date: receive,
  receive_date_raw: receive ?? "-", receiver, faktur: "Ya", send_receipt_doc_no: null, ...o,
});
const base = (o: Partial<Datasets["sj"]> = {}): Datasets["sj"] => ({
  events: [ev("SJ/1", "Wienda Aswar", "2026-09-04"), ev("SJ/2", null, null), ev("SJ/2", "Marselia Angelia", "2026-09-05")],
  receivers: [{ id: 1, name: "Bintang Anugia Arragi", active: true }, { id: 2, name: "Wienda Aswar", active: true }],
  batches: [{ id: 1, file_name: "uji.csv", rows_total: 3, rows_new: 3, rows_dup: 0, rows_bad: 0, published_at: "2026-09-30T02:00:00Z", uploader: "Mando" }],
  log: [], canManage: false, ...o,
});

let host: HTMLDivElement, root: Root;
beforeEach(() => { sessionStorage.clear(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllMocks(); });
const tab = (label: string) => act(() => { [...host.querySelectorAll<HTMLButtonElement>("[role=tab]")].find((b) => b.textContent?.includes(label))!.click(); });
const text = () => host.textContent ?? "";
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });

describe("Monitor Surat Jalan — tampilan", () => {
  it("Dashboard: KPI dari filter yang sama dengan Kertas Kerja, status teks, periode tampil", () => {
    h.data = base();
    act(() => root.render(<SjView />));
    expect(text()).toContain("Periode Tanggal SJ: 01/09/2026 – 30/09/2026 (bulan terbaru)");
    expect(text()).toContain("Total SJ unik2");
    expect(text()).toContain("3,0 hari"); // SJ/1: 1 → 4 Sep
    expect(text()).toContain("Hanya Receiver di luar daftar1");
    tab("Kertas Kerja");
    const rows = host.querySelectorAll("tbody tr[data-index]");
    expect(rows.length).toBe(2);
    expect(text()).toContain("Sudah diterima");
    expect(text()).toContain("Belum diterima");
  });

  it("tanpa sampel durasi → rata-rata '—', bukan 0 hari", () => {
    h.data = base({ events: [ev("SJ/9", null, null)] });
    act(() => root.render(<SjView />));
    const kpi = [...host.querySelectorAll("div")].find((d) => d.firstElementChild?.textContent === "Rata-rata waktu penerimaan");
    expect(kpi?.textContent).toContain("—");
    expect(kpi?.textContent).not.toContain("0 hari");
  });

  it("kosong: pesan jelas, bukan angka nol", () => {
    h.data = base({ events: [], batches: [] });
    act(() => root.render(<SjView />));
    expect(text()).toContain("Belum ada data serah terima");
  });

  it("non-Controller: upload & pengaturan Receiver nonaktif dengan penjelasan", () => {
    h.data = base({ canManage: false });
    act(() => root.render(<SjView />));
    tab("Upload & Setting");
    expect(host.querySelector<HTMLInputElement>("input[type=file]")!.disabled).toBe(true);
    expect(text()).toContain("hanya untuk Controller dan Super Admin");
    expect(host.querySelector("input[placeholder='Nama Receiver baru']")).toBeNull();
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "Nonaktifkan…")).toBe(false);
  });
});

describe("Monitor Surat Jalan — memuat", () => {
  it("Upload & Setting saat data belum termuat: 'Memuat', bukan pesan tidak berhak", () => {
    h.data = null; h.loading = true;
    act(() => root.render(<SjView />));
    tab("Upload & Setting");
    expect(text()).toContain("Memuat data & hak akses");
    expect(text()).not.toContain("hanya untuk Controller dan Super Admin");
    h.loading = false;
  });
});

describe("Monitor Surat Jalan — upload", () => {
  const CSV = [
    "Area,SJ No.,Tanggal SJ,Business Partner,Locator,Send Date,Sender,Receive Date,Receiver,Jumlah Hari,Faktur,Description,No. Route,Shipper 1,No. Plat,Driver,Shipper 2,Send Receipt Doc No",
    "Jakarta,TEST/1,01 Sep 2026,Toko A,L1,02 Sep 2026,Siti,03 Sep 2026,Wienda Aswar,2,Ya,\"baris\nkedua\",R1,PT X,B 1,Budi,,101",
    "Jakarta,,01 Sep 2026,Toko A,L1,-,-,-,-,-,Ya,,R1,PT X,B 1,Budi,,102",
    "Jakarta,TEST/2,01 Sep 2026,Toko B,L1,-,-,-,-,-,Ya,,R1,PT X,B 1,Budi,,103",
  ].join("\n");
  const pickFile = async () => {
    const input = host.querySelector<HTMLInputElement>("input[type=file]")!;
    const file = new File([CSV], "uji.csv", { type: "text/csv" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await flush();
  };

  it("pratinjau → Import: baris sumber dikirim dengan nomor baris, hasil dari server ditampilkan", async () => {
    h.data = base({ canManage: true });
    h.rpc.mockImplementation(async (fn: string) => {
      if (fn === "sj_upload_begin") return { data: { batch: 7, seenAt: null }, error: null };
      if (fn === "sj_upload_rows") return { data: 2, error: null };
      if (fn === "sj_upload_commit") return { data: { batch: 7, total: 2, new: 1, dup: 1, bad: 1 }, error: null };
      return { data: null, error: null };
    });
    act(() => root.render(<SjView />));
    tab("Upload & Setting");
    await pickFile();
    expect(text()).toContain("Pratinjau: uji.csv");
    expect(text()).toContain("Baris bermasalah (tidak diimpor)1");
    expect(text()).toContain("No. SJ kosong");
    await act(async () => { [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith("Import 2"))!.click(); });
    await flush();
    const begin = h.rpc.mock.calls.find((c) => c[0] === "sj_upload_begin")![1];
    expect(begin).toMatchObject({ p_file_name: "uji.csv", p_rows_total: 2, p_rows_bad: 1 });
    const sent = h.rpc.mock.calls.find((c) => c[0] === "sj_upload_rows")![1].p_rows;
    expect(sent.map((r: { line: number; sj_no: string }) => [r.line, r.sj_no])).toEqual([[2, "TEST/1"], [5, "TEST/2"]]);
    expect(text()).toContain("Hasil upload (dikonfirmasi server)");
    expect(text()).toContain("Kejadian baru disimpan1");
    expect(text()).toContain("Identik, dilewati1");
    expect(h.reload).toHaveBeenCalled();
  });

  it("gagal di tengah: pesan jelas, tidak ada hasil 'berhasil', bisa diulang", async () => {
    h.data = base({ canManage: true });
    h.rpc.mockImplementation(async (fn: string) => (fn === "sj_upload_begin"
      ? { data: { batch: 8, seenAt: null }, error: null }
      : { data: null, error: { message: "koneksi terputus" } }));
    act(() => root.render(<SjView />));
    tab("Upload & Setting");
    await pickFile();
    await act(async () => { [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith("Import"))!.click(); });
    await flush();
    expect(text()).toContain("Upload gagal, tidak ada data yang ditampilkan: koneksi terputus");
    expect(text()).not.toContain("Hasil upload");
    expect(h.rpc.mock.calls.some((c) => c[0] === "sj_upload_commit")).toBe(false);
    expect([...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith("Import"))!.disabled).toBe(false);
  });

  it("Receiver: duplikat setelah normalisasi ditolak di form; pratinjau dampak sebelum simpan", async () => {
    h.data = base({ canManage: true });
    h.rpc.mockResolvedValue({ data: { id: 3, name: "Marselia Angelia" }, error: null });
    act(() => root.render(<SjView />));
    tab("Upload & Setting");
    const input = host.querySelector<HTMLInputElement>("input[placeholder='Nama Receiver baru']")!;
    const type = (v: string) => act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, v);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    type("  WIENDA   aswar ");
    expect(text()).toContain('Nama "Wienda Aswar" sudah ada di daftar');
    type("Marselia Angelia");
    act(() => { [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Tambah…")!.click(); });
    expect(document.body.textContent).toContain("1 SJ berubah status");
    await act(async () => { [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Simpan perubahan")!.click(); });
    await flush();
    expect(h.rpc).toHaveBeenCalledWith("sj_receiver_save", { p_id: null, p_name: "Marselia Angelia", p_active: true });
  });
});

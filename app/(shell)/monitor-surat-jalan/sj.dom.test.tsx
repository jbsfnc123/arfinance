// @vitest-environment happy-dom
// Monitor Surat Jalan (Fase 85): daftar = SJ dari laporan Serah Terima (TIDAK bergantung pada Aging); upload mengirim semua
// SJ/… di file + penerimaan yang belum tersimpan (baris pertama dengan Receiver diakui); kontrol tulis per peran;
// rata-rata "—"; gagal = tidak ada hasil palsu.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Datasets } from "@/lib/local/datasets";
import type { SjDocRec, SjReceipt } from "@/lib/modules/sj/compute";

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
const ag = (sj_key: string, tanggal_sj: string, o: Partial<SjDocRec> = {}): SjDocRec =>
  ({ sj_key, sj_no: sj_key, tanggal_sj, business_partner: "Toko A", area: "Jakarta", locator: "TRA-JKT D5", send_date: null, ...o });
const rc = (sj_key: string, receive_date: string, receiver: string): SjReceipt => ({ sj_key, sj_no: sj_key, receive_date, receiver, file_name: "a.csv", recorded_at: "2026-09-30T01:00:00Z" });
const base = (o: Partial<Datasets["sj"]> = {}): Datasets["sj"] => ({
  docs: [ag("SJ/1", "2026-09-01"), ag("SJ/2", "2026-09-03"), ag("SJ/3", "2026-09-05")],
  receipts: [rc("SJ/1", "2026-09-04", "Wienda Aswar")],
  receivers: [{ id: 1, name: "Bintang Anugia Arragi", active: true }, { id: 2, name: "Wienda Aswar", active: true }],
  hidden: [], log: [], uploads: [{ at: "2026-09-30T02:00:00Z", file_name: "lama.csv", rows: 1, uploader: "Mando" }],
  docsAt: { file: "lama.csv", at: "2026-09-30T02:00:00Z" }, canManage: false, ...o,
});

let host: HTMLDivElement, root: Root;
beforeEach(() => { sessionStorage.clear(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllMocks(); });
const tab = (label: string) => act(() => { [...host.querySelectorAll<HTMLButtonElement>("[role=tab]")].find((b) => b.textContent?.includes(label))!.click(); });
const text = () => host.textContent ?? "";
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
const btn = (start: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith(start));

describe("Monitor Surat Jalan — tampilan", () => {
  it("Dashboard: ringkasan per Business Partner per bulan (SJ / Sudah / Belum + Total), semua periode, tanpa Aging", () => {
    h.data = base({ docs: [ag("SJ/1", "2026-09-01"), ag("SJ/2", "2026-10-03"), ag("SJ/3", "2026-09-05", { business_partner: "Toko B" })] });
    act(() => root.render(<SjView />));
    expect(text()).toContain("Periode Tanggal SJ: semua periode · Area: semua · Business Partner: semua");
    const heads = [...host.querySelectorAll("thead th")].map((t) => t.textContent?.trim()).filter(Boolean).join("|");
    expect(heads).toMatch(/Business Partner.*Sep 2026 · SJ.*Sep 2026 · Sudah.*Sep 2026 · Belum.*Okt 2026 · SJ.*Total SJ.*Total Sudah.*Total Belum.*% Sudah/);
    const rowA = [...host.querySelectorAll("tbody tr[data-index]")].find((tr) => tr.textContent?.includes("Toko A"))!;
    expect([...rowA.querySelectorAll("td")].map((td) => td.textContent?.trim()).filter((x) => x !== "")).toEqual(["Toko A", "1", "1", "0", "1", "0", "1", "2", "1", "1", "50"]);
    expect(host.querySelector("[aria-label='Total']")?.textContent).toMatch(/Business Partner2.*SJ3.*Sudah diterima1.*Belum diterima2/);
    expect(text()).not.toMatch(/Aging/);
  });

  it("klik Business Partner di Dashboard → Kertas Kerja terfilter BP itu; filter BP (bukan Locator) di Kertas Kerja", () => {
    h.data = base({ docs: [ag("SJ/1", "2026-09-01", { area: "Bandung" }), ag("SJ/2", "2026-09-03", { business_partner: "Toko B" }), ag("SJ/3", "2026-09-05")] });
    act(() => root.render(<SjView />));
    expect(host.querySelector("select[aria-label='Locator']")).toBeNull();
    act(() => { [...host.querySelectorAll<HTMLButtonElement>("tbody button")].find((b) => b.textContent === "Toko B")!.click(); });
    expect(host.querySelector("[role=tab][aria-selected=true]")?.textContent).toContain("Kertas Kerja");
    expect(host.querySelector<HTMLInputElement>("input[aria-label='Business Partner']")!.value).toBe("Toko B");
    expect(host.querySelectorAll("tbody tr[data-index]").length).toBe(1);
    const heads = [...host.querySelectorAll("thead th")].map((t) => t.textContent?.trim()).filter(Boolean);
    expect(heads.slice(0, 7).join("|")).toMatch(/^SJ No\..*Tanggal SJ.*Business Partner.*Area.*Status.*Receiver.*Receive Date/);
    act(() => { host.querySelector<HTMLButtonElement>("button[aria-label='Hapus filter Business Partner']")!.click(); });
    expect(host.querySelectorAll("tbody tr[data-index]").length).toBe(3);
    const area = host.querySelector<HTMLSelectElement>("select[aria-label='Area']")!;
    expect([...area.options].map((o) => o.textContent)).toEqual(["Area: semua (2)", "Bandung (1)", "Jakarta (2)"]);
  });

  it("BP / Area yang tidak dicentang (tersimpan) tidak tampil di Dashboard & Kertas Kerja", () => {
    h.data = base({ docs: [ag("SJ/1", "2026-09-01", { area: "Bandung" }), ag("SJ/2", "2026-09-03", { business_partner: "Toko B" }), ag("SJ/3", "2026-09-05")],
      hidden: [{ kind: "area", value: "Bandung" }, { kind: "bp", value: "Toko B" }] });
    act(() => root.render(<SjView />));
    expect(host.querySelector("[aria-label='Total']")?.textContent).toMatch(/Business Partner1.*SJ1/);
    tab("Kertas Kerja");
    expect(host.querySelectorAll("tbody tr[data-index]").length).toBe(1);
  });

  it("Setting: centang BP & Area urut A-Z; perubahan disimpan lewat sj_visibility_set", async () => {
    h.data = base({ canManage: true, docs: [ag("SJ/1", "2026-09-01", { business_partner: "Zeta" }), ag("SJ/2", "2026-09-03", { business_partner: "Alfa", area: "Bandung" })] });
    h.rpc.mockResolvedValue({ data: { count: 1 }, error: null });
    act(() => root.render(<SjView />));
    tab("Upload & Setting");
    const boxes = (kind: string) => [...host.querySelectorAll<HTMLInputElement>(`input[aria-label^='Tampilkan ${kind} ']`)];
    expect(boxes("Business Partner").map((b) => b.getAttribute("aria-label"))).toEqual(["Tampilkan Business Partner Alfa", "Tampilkan Business Partner Zeta"]);
    expect(boxes("Area").map((b) => b.checked)).toEqual([true, true]);
    act(() => { boxes("Business Partner")[1].click(); });
    act(() => { boxes("Area")[0].click(); });
    await act(async () => { btn("Simpan perubahan (2)")!.click(); });
    await flush();
    expect(h.rpc).toHaveBeenCalledWith("sj_visibility_set", { p_kind: "area", p_values: ["Bandung"], p_hidden: true });
    expect(h.rpc).toHaveBeenCalledWith("sj_visibility_set", { p_kind: "bp", p_values: ["Zeta"], p_hidden: true });
    expect(h.reload).toHaveBeenCalled();
  });

  it("belum ada laporan: pesan jelas (bukan soal Aging)", () => {
    h.data = base({ docs: [], receipts: [], canManage: true });
    act(() => root.render(<SjView />));
    expect(text()).toContain("Belum ada laporan Serah Terima");
    expect(text()).not.toMatch(/Aging/);
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
    L("SJ/3", "08 Sep 2026", "Bintang Anugia Arragi"),    // ← disimpan
    L("SJ/99", "08 Sep 2026", "Wienda Aswar"),            // SJ baru (tidak perlu ada di Aging) ← disimpan
    L("MR/7", "08 Sep 2026", "Wienda Aswar"),             // bukan SJ/… → tidak masuk daftar dipantau
  ].join("\n");
  const pickFile = async () => {
    const input = host.querySelector<HTMLInputElement>("input[type=file]")!;
    Object.defineProperty(input, "files", { value: [new File([CSV], "uji.csv", { type: "text/csv" })], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await flush();
  };

  it("pratinjau SJ baru & penerimaan → sj_report_apply (dokumen + penerimaan, tanpa Aging); hasil dari server", async () => {
    h.data = base({ canManage: true });
    h.rpc.mockResolvedValue({ data: { docs: 4, docsNew: 1, sent: 3, saved: 3, existing: 0, notRecognized: 0, badDate: 0 }, error: null });
    act(() => root.render(<SjView />));
    tab("Upload & Setting");
    await pickFile();
    expect(text()).toContain("SJ dipantau (SJ/…)4");
    expect(text()).toContain("· SJ baru1");
    expect(text()).toContain("SJ dengan penerimaan diakui5");
    expect(text()).toContain("· sudah punya Receive Date (dilewati)1");
    expect(text()).toContain("Receive Date akan disimpan4");
    expect(text()).toContain("Marselia Angelia — 1 baris");
    expect(text()).not.toMatch(/Aging/);
    await act(async () => { btn("Simpan 4 SJ · 4 Receive Date")!.click(); });
    await flush();
    const [fn, args] = h.rpc.mock.calls[0];
    expect(fn).toBe("sj_report_apply");
    expect(args.p_file_name).toBe("uji.csv");
    expect(args.p_docs.map((d: { sj_key: string }) => d.sj_key)).toEqual(["SJ/1", "SJ/2", "SJ/3", "SJ/99"]);
    expect(args.p_docs[0]).toMatchObject({ tanggal_sj: "2026-09-01", area: "Jakarta", business_partner: "Toko A", locator: "L1", send_date: "2026-09-02" });
    expect(args.p_receipts).toEqual([
      { sj_key: "SJ/2", sj_no: "SJ/2", receive_date: "2026-09-07", receiver: "Wienda Aswar" },
      { sj_key: "SJ/3", sj_no: "SJ/3", receive_date: "2026-09-08", receiver: "Bintang Anugia Arragi" },
      { sj_key: "SJ/99", sj_no: "SJ/99", receive_date: "2026-09-08", receiver: "Wienda Aswar" },
      { sj_key: "MR/7", sj_no: "MR/7", receive_date: "2026-09-08", receiver: "Wienda Aswar" },
    ]);
    expect(text()).toContain("Hasil upload (dikonfirmasi server)");
    expect(text()).toContain("Receive Date disimpan3");
    expect(text()).toContain("· SJ baru1");
    expect(h.reload).toHaveBeenCalled();
  });

  it("gagal: pesan jelas, tidak ada hasil 'berhasil', bisa diulang", async () => {
    h.data = base({ canManage: true });
    h.rpc.mockResolvedValue({ data: null, error: { message: "koneksi terputus" } });
    act(() => root.render(<SjView />));
    tab("Upload & Setting");
    await pickFile();
    await act(async () => { btn("Simpan 4 SJ")!.click(); });
    await flush();
    expect(text()).toContain("Upload gagal: koneksi terputus");
    expect(text()).not.toContain("Hasil upload");
    expect(btn("Simpan 4 SJ")!.disabled).toBe(false);
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

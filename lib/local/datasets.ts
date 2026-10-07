import { unpack, type Packed } from "./pack";
import type { SjAging, SjReceipt, SjReceiver } from "@/lib/modules/sj/compute";
import type { DatasetKey } from "@/lib/cache/versions";
import type { RowMark } from "@/lib/modules/row-marks";

// Definisi dataset lokal: RPC paket, token versi penentu, dan bentuk hasil setelah di-unpack.

export type ErpInvoice = {
  invoice_no: string; invoice_date: string; amount: number; bp_key?: string | null;
  due_date?: string | null; payment_term?: string | null; bp_name?: string | null; bp_location?: string | null;
};
export type AgingLine = {
  line_no: number; invoice_no: string | null; payment_group: string | null; marketing: string | null;
  collection_name: string | null; sales_name: string | null; bp_key: string | null; business_partner: string | null;
  tax_name: string | null; invoice_date: string | null; due_date: string | null; open_amt: number;
  cur_0_30: number; cur_31_60: number; due_1_7: number; due_8_30: number; due_31_60: number; due_61_90: number;
  due_90: number; days: number | null; branch: string | null; no_po: string | null; no_sj: string | null;
};
export type Note = {
  id: number; invoice_no: string; kategori: string; business_partner: string | null; isi: string | null;
  collection_name: string | null; invoice_date: string | null; no_po: string | null; no_sj: string | null;
  done: boolean; closed_by: string | null; closed_at: string | null; created_at: string;
};
export type Promise_ = { id: number; invoice_no: string; business_partner: string | null; collection_name: string | null; promise_date: string | null; isi: string | null; created_at: string };
export type Exchange = { id: number; invoice_no: string; metode: string; tanggal: string | null; keterangan: string | null; resi: string | null; foto_path: string | null; kurir: string | null; collection_name: string | null };
export type Target = { month: string; invoice_no: string; target: number; marketing: string | null; collection_name: string | null; business_partner: string | null; due_date: string | null; branch: string | null; no_sj?: string | null };
export type Worksheet = { id: number; payment_group: string | null; business_partner: string | null; invoice_no: string | null; invoice_date: string | null; due_date: string | null; open_amt: number; branch: string | null; no_po: string | null; no_sj: string };
export type Gr = { id: number; no: string | null; store_no: string | null; delivery_to: string | null; gr_no: string | null; gr_date: string | null; po_no: string | null; po_date: string | null; vendor_ship_no: string | null; item_code: string | null; item_name: string | null; uom: string | null; qty_order: number | null; qty_received: number | null; status: string | null; sj_no: string | null };
export type Kwitansi = { id: number; username: string | null; invoice_no: string; vendor_invoice_no: string | null; invoice_date: string | null; kuitansi_no: string | null; kuitansi_date: string | null; accepted_date: string | null; pfi_no: string | null; gr_no: string | null; po_no: string | null; total_net: number };
export type Schedule = { no_kw: string; spp: string | null; nilai_kw: number; tgl_tukar_faktur: string | null; jadwal_transfer: string | null; notes: string | null };
// RKM Tukar Faktur (Anyar Retail Indonesia): Kertas Kerja dari aging + file portal RKM (kunci No SJ).
export type RkmWorksheet = { id: number; business_partner: string | null; invoice_no: string | null; invoice_date: string | null; due_date: string | null; open_amt: number; branch: string | null; no_po: string | null; no_sj: string };
export type RkmGr = { id: number; no: string | null; grpo_no: string | null; no_sj: string | null; tgl_grpo: string | null; jumlah_grpo_grn: number | null; no_faktur_pajak: string | null; tgl_pajak: string | null; jumlah: number | null; selisih: number | null; cabang: string | null; no_po: string | null; jumlah_grpo: number | null; no_grn: string | null; jumlah_grn: number | null };
export type RkmKw = { id: number; no: string | null; grpo_no: string | null; tgl_grpo: string | null; cabang: string | null; no_sj: string | null; no_po: string | null; jumlah_grpo: number | null; no_grn: string | null; total_grn: number | null; total_grpo_grn: number | null; tgl_faktur_pajak: string | null; no_faktur_pajak: string | null; jumlah_faktur_pajak: number | null; selisih: number | null; pembuat: string | null; tanggal_input: string | null };
export type Mutation = { id: number; account: string; tx_date: string; amount: number; keterangan: string | null; catatan: string | null; excluded: boolean; excluded_note: string | null };
export type Remark = { ref: string; no_sj: string | null; invoice_no: string | null; keterangan: string; source: string; updated_at: string; updated_by_name: string | null };
export type SjUpload = { at: string; file_name: string; rows: number; uploader: string };
export type SjLog = { at: string; action: string; old_name: string | null; new_name: string | null; by_name: string };
export type Account = { code: string; last4: string; sort: number; active: boolean };

export type Datasets = {
  aging: { month: string | null; uploadedAt: string | null; lines: AgingLine[] };
  activity: { notes: Note[]; promises: Promise_[]; exchanges: Exchange[] };
  targets: { targets: Target[] };
  m10: { worksheet: Worksheet[]; gr: Gr[]; kwitansi: Kwitansi[]; schedule: Schedule[] };
  rkm: { worksheet: RkmWorksheet[]; gr: RkmGr[]; kwitansi: RkmKw[] };
  mutasi: { accounts: Account[]; mutations: Mutation[] };
  erp: { invoices: ErpInvoice[]; payments: { invoice_no: string; payment_date: string; amount: number }[] };
  tukar: { done: { tanggal_tukar: string | null; kurir: string | null; business_partner: string | null; kode: string | null }[] };
  settings: Record<string, unknown>;
  remarks: { remarks: Remark[] };
  // ERP khusus History Pembayaran (pack_erp_recent): invoice ber-tempo yang dibayar ±4 bulan terakhir + pembayarannya;
  // counts = jumlah semua pembayaran per bulan (YYYY-MM) untuk peringatan data belum di-upload.
  payhist: { invoices: ErpInvoice[]; payments: { invoice_no: string; payment_date: string; amount: number }[]; counts?: Record<string, number> };
  // Penanda warna baris Kertas Kerja (row_marks, migrasi 0040) per modul.
  m10Marks: { marks: RowMark[] };
  rkmMarks: { marks: RowMark[] };
  // Receive Date SJ (Receiver aktif) untuk kolom Daftar Tagihan (migrasi 0047).
  sjReceive: { rows: { sj_key: string; receive_date: string }[] };
  // Monitor Surat Jalan (migrasi 0045): SJ aging terbaru, penerimaan tersimpan, daftar Receiver, riwayat upload & perubahan.
  sj: { aging: SjAging[]; receipts: SjReceipt[]; receivers: SjReceiver[]; log: SjLog[]; uploads: SjUpload[];
    agingAt: { month: string; at: string } | null; canManage: boolean };
};
export type DatasetName = keyof Datasets;

type Raw = Record<string, unknown>;

// pack_erp (Fase 29): payment_term & nama/lokasi BP dikirim sebagai kamus (`terms`, `labels`) + indeks per invoice
// (`t`, `l`) agar teks yang berulang tidak dikirim 51 ribu kali. Format lama (kolom teks langsung) tetap dibaca.
export function decodeErp(r: Raw): Datasets["erp"] {
  const payments = unpack<Datasets["erp"]["payments"][number]>(r.payments as Packed);
  const terms = r.terms as string[] | undefined;
  const labels = r.labels as [string, string][] | undefined;
  if (!terms || !labels) return { invoices: unpack<ErpInvoice>(r.invoices as Packed), payments };
  const raw = unpack<ErpInvoice & { t: number; l: number }>(r.invoices as Packed);
  const invoices = raw.map(({ t, l, ...i }) => {
    const lb = labels[l];
    return { ...i, payment_term: terms[t] || null, bp_name: lb?.[0] || null, bp_location: lb?.[1] || null };
  });
  return { invoices, payments };
}
const tables = (raw: Raw, names: string[]) => Object.fromEntries(names.map((n) => [n, unpack(raw[n] as Packed)]));

export const DATASETS: { [K in DatasetName]: { rpc: string; args?: Record<string, unknown>; deps: DatasetKey[]; decode: (raw: Raw) => Datasets[K] } } = {
  aging: { rpc: "pack_aging", deps: ["aging"], decode: (r) => ({ month: (r.month as string) ?? null, uploadedAt: (r.uploadedAt as string) ?? null, lines: unpack<AgingLine>(r.lines as Packed) }) },
  activity: { rpc: "pack_activity", deps: ["activity"], decode: (r) => tables(r, ["notes", "promises", "exchanges"]) as Datasets["activity"] },
  targets: { rpc: "pack_targets", deps: ["targets"], decode: (r) => tables(r, ["targets"]) as Datasets["targets"] },
  m10: { rpc: "pack_m10", deps: ["m10", "aging"], decode: (r) => tables(r, ["worksheet", "gr", "kwitansi", "schedule"]) as Datasets["m10"] },
  rkm: { rpc: "pack_rkm", deps: ["rkm"], decode: (r) => tables(r, ["worksheet", "gr", "kwitansi"]) as Datasets["rkm"] },
  mutasi: { rpc: "pack_mutasi", deps: ["mutasi"], decode: (r) => tables(r, ["accounts", "mutations"]) as Datasets["mutasi"] },
  erp: { rpc: "pack_erp", deps: ["erp"], decode: decodeErp },
  tukar: { rpc: "pack_tukar", deps: ["tukar"], decode: (r) => tables(r, ["done"]) as Datasets["tukar"] },
  settings: { rpc: "pack_settings", deps: ["settings"], decode: (r) => r },
  remarks: { rpc: "pack_remarks", deps: ["remarks"], decode: (r) => tables(r, ["remarks"]) as Datasets["remarks"] },
  payhist: { rpc: "pack_erp_recent", deps: ["erp"], decode: (r) => ({ ...decodeErp(r), counts: (r.counts as Record<string, number>) ?? undefined }) },
  m10Marks: { rpc: "pack_row_marks", args: { p_module: "m10" }, deps: ["row_marks"], decode: (r) => ({ marks: unpack<RowMark>(r as Packed) }) },
  rkmMarks: { rpc: "pack_row_marks", args: { p_module: "rkm" }, deps: ["row_marks"], decode: (r) => ({ marks: unpack<RowMark>(r as Packed) }) },
  sjReceive: { rpc: "pack_sj_receive", deps: ["sj"], decode: (r) => ({ rows: unpack<{ sj_key: string; receive_date: string }>(r as Packed) }) },
  sj: { rpc: "pack_sj", deps: ["sj", "aging"], decode: (r) => ({
    ...(tables(r, ["aging", "receipts", "receivers", "log", "uploads"]) as Omit<Datasets["sj"], "canManage" | "agingAt">),
    agingAt: (r.agingAt as Datasets["sj"]["agingAt"]) ?? null, canManage: r.canManage === true }) },
};

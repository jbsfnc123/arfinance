import { unpack, type Packed } from "./pack";
import type { DatasetKey } from "@/lib/cache/versions";

// Definisi dataset lokal: RPC paket, token versi penentu, dan bentuk hasil setelah di-unpack.

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
export type Target = { month: string; invoice_no: string; target: number; marketing: string | null; collection_name: string | null; business_partner: string | null; due_date: string | null; branch: string | null };
export type Worksheet = { id: number; payment_group: string | null; business_partner: string | null; invoice_no: string | null; invoice_date: string | null; due_date: string | null; open_amt: number; branch: string | null; no_po: string | null; no_sj: string; keterangan: string | null };
export type Gr = { id: number; no: string | null; store_no: string | null; delivery_to: string | null; gr_no: string | null; gr_date: string | null; po_no: string | null; po_date: string | null; vendor_ship_no: string | null; item_code: string | null; item_name: string | null; uom: string | null; qty_order: number | null; qty_received: number | null; status: string | null; sj_no: string | null };
export type Kwitansi = { id: number; username: string | null; invoice_no: string; vendor_invoice_no: string | null; invoice_date: string | null; kuitansi_no: string | null; kuitansi_date: string | null; accepted_date: string | null; pfi_no: string | null; gr_no: string | null; po_no: string | null; total_net: number };
export type Schedule = { no_kw: string; spp: string | null; nilai_kw: number; tgl_tukar_faktur: string | null; jadwal_transfer: string | null; notes: string | null };
export type Mutation = { id: number; account: string; tx_date: string; amount: number; keterangan: string | null; catatan: string | null; excluded: boolean; excluded_note: string | null };
export type Account = { code: string; last4: string; sort: number; active: boolean };

export type Datasets = {
  aging: { month: string | null; uploadedAt: string | null; lines: AgingLine[] };
  activity: { notes: Note[]; promises: Promise_[]; exchanges: Exchange[] };
  targets: { targets: Target[] };
  m10: { worksheet: Worksheet[]; gr: Gr[]; kwitansi: Kwitansi[]; schedule: Schedule[] };
  mutasi: { accounts: Account[]; mutations: Mutation[] };
  erp: { invoices: { invoice_no: string; invoice_date: string; amount: number }[]; payments: { invoice_no: string; payment_date: string; amount: number }[] };
  tukar: { done: { tanggal_tukar: string | null; kurir: string | null; business_partner: string | null; kode: string | null }[] };
  settings: Record<string, unknown>;
};
export type DatasetName = keyof Datasets;

type Raw = Record<string, unknown>;
const tables = (raw: Raw, names: string[]) => Object.fromEntries(names.map((n) => [n, unpack(raw[n] as Packed)]));

export const DATASETS: { [K in DatasetName]: { rpc: string; deps: DatasetKey[]; decode: (raw: Raw) => Datasets[K] } } = {
  aging: { rpc: "pack_aging", deps: ["aging"], decode: (r) => ({ month: (r.month as string) ?? null, uploadedAt: (r.uploadedAt as string) ?? null, lines: unpack<AgingLine>(r.lines as Packed) }) },
  activity: { rpc: "pack_activity", deps: ["activity"], decode: (r) => tables(r, ["notes", "promises", "exchanges"]) as Datasets["activity"] },
  targets: { rpc: "pack_targets", deps: ["targets"], decode: (r) => tables(r, ["targets"]) as Datasets["targets"] },
  m10: { rpc: "pack_m10", deps: ["m10"], decode: (r) => tables(r, ["worksheet", "gr", "kwitansi", "schedule"]) as Datasets["m10"] },
  mutasi: { rpc: "pack_mutasi", deps: ["mutasi"], decode: (r) => tables(r, ["accounts", "mutations"]) as Datasets["mutasi"] },
  erp: { rpc: "pack_erp", deps: ["erp"], decode: (r) => tables(r, ["invoices", "payments"]) as Datasets["erp"] },
  tukar: { rpc: "pack_tukar", deps: ["tukar"], decode: (r) => tables(r, ["done"]) as Datasets["tukar"] },
  settings: { rpc: "pack_settings", deps: ["settings"], decode: (r) => r },
};

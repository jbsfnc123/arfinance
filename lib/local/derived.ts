import type { AgingLine, Datasets } from "./datasets";
import { memoize } from "./memo";
import { arInvoices, collectionRows, computeSpvSummary, filterOf, type ArInvoice } from "@/lib/modules/collection/rows";
import { enrichRow } from "@/lib/modules/collection/view-model";
import { collectionAllocation } from "@/lib/modules/collection/allocation";
import { computeM10, m10AgingLines } from "@/lib/modules/m10/compute";

// Hasil hitungan berat dibagi ANTAR halaman: dihitung sekali per versi data (identitas objek
// dataset di store lokal), jadi pindah menu lalu kembali tidak menghitung ulang.

// Invoice Collection dari snapshot aging (filter marketing/tanggal dari pengaturan).
export const arOf = memoize((lines: AgingLine[], settings: Record<string, unknown> | null) => arInvoices(lines, filterOf(settings)));

// Baris tabel Collection per collection (aging dihitung dari tanggal hari ini).
export const collectionRowsOf = memoize((ar: ArInvoice[], activity: Datasets["activity"], remarks: Map<string, string>, coll: string, today: string) =>
  collectionRows(ar.filter((a) => a.collection_name === coll), activity, remarks).map((r) => enrichRow(r, today)));

export const spvSummaryOf = memoize((month: string, today: string, targets: Datasets["targets"], ar: ArInvoice[],
  activity: Datasets["activity"], lastTagihanUpdate: string | null, agingAll: AgingLine[]) =>
  computeSpvSummary({ month, today, targets: targets.targets, ar, promises: activity.promises, notes: activity.notes, lastTagihanUpdate, agingAll }));

export const m10LinesOf = memoize((lines: AgingLine[], taxName: string) => m10AgingLines(lines, taxName));

export const m10Of = memoize((m10: Datasets["m10"], aging: AgingLine[], remarks: Map<string, string>) => computeM10({ ...m10, aging, remarks }));

// Alokasi (pembayaran ERP) per hari untuk satu collection & bulan (Daftar Tagihan).
export const collectionAllocationOf = memoize((month: string, collection: string, erp: Datasets["erp"], targets: Datasets["targets"], agingAll: AgingLine[]) =>
  collectionAllocation({ month, collection, payments: erp.payments, invoices: erp.invoices, targets: targets.targets, agingAll }));

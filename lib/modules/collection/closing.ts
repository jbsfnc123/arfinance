import type { AgingLine, Note, Promise_, Target } from "@/lib/local/datasets";
import { computeSpvSummary } from "./closing-v1/summary";
import { allocationSeries, reconcileCollected } from "./closing-v1/reconcile";

export type ClosingSource = {
  schemaVersion: 1; month: string; cutoff: string;
  aging: { lines: AgingLine[]; asOf: string; verified: boolean; fileName: string; uploadedAt: string; snapshotId: number } | null;
  targets: Target[]; payments: { invoice_no: string; payment_date: string; amount: number }[];
  notes: Note[]; promises: Promise_[]; settings: Record<string, unknown>;
};
export type ClosingPreview = { source: ClosingSource; token: string; revision: number };
export type CollectionPeriod = {
  month: string; status: "open" | "closed"; revision: number;
  canManage: boolean; canReopen: boolean; months: string[]; source: ClosingSource;
  closedAt: string | null; closedBy: string | null;
  history: { id: number; revision: number; action: "close" | "reopen"; reason: string | null; at: string; actor: string }[];
};
export function monthEnd(month: string) {
  const [y,m] = month.split("-").map(Number);
  return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
}
// Closed snapshots are evaluated ONLY by the pinned v1 functions, never against live datasets or today's date.
export function closingReport(source: ClosingSource) {
  if (source.schemaVersion !== 1) throw new Error("Versi snapshot closing belum didukung. Perbarui aplikasi.");
  const lines = source.aging?.lines ?? [];
  return {
    data: computeSpvSummary({ month: source.month, today: source.cutoff, targets: source.targets,
      ar: [], agingAll: lines, notes: source.notes, promises: source.promises,
      lastTagihanUpdate: source.aging?.uploadedAt ?? null }),
    alloc: allocationSeries({ month: source.month, today: source.cutoff, targets: source.targets, payments: source.payments }),
    recon: reconcileCollected({ month: source.month, targets: source.targets, agingAll: lines, payments: source.payments }),
  };
}

// The same snapshot provides both the dashboard and the downloadable audit workbook.
export function closingSheets(source: ClosingSource) {
  const report = closingReport(source);
  return [
    { name: "Ringkasan", rows: [
      ["Periode", source.month], ["Cut off", source.cutoff], ["File Aging", source.aging?.fileName ?? ""],
      ["Tanggal Aging", source.aging?.asOf ?? ""], ["Target", report.data.target], ["Sisa", report.data.sisa],
      ["Terkumpul", report.data.terkumpul], ["Pencapaian (%)", report.data.pencapaian],
      ["Alokasi target", report.alloc.totalAllocT], ["Selisih rekonsiliasi", report.recon.selisih],
    ] },
    { name: "Target", rows: [["Invoice", "No SJ", "Pelanggan", "Marketing", "Collection", "Cabang", "Jatuh tempo", "Target"],
      ...source.targets.map(t=>[t.invoice_no,t.no_sj,t.business_partner,t.marketing,t.collection_name,t.branch,t.due_date,t.target])] },
    { name: "Posisi Aging", rows: [["Invoice", "No SJ", "Pelanggan", "Jatuh tempo", "Sisa"],
      ...(source.aging?.lines ?? []).map(l=>[l.invoice_no,l.no_sj,l.business_partner,l.due_date,l.open_amt])] },
    { name: "Alokasi Harian", rows: [["Tanggal", "Alokasi target", "Alokasi seluruhnya", "Kumulatif target", "Kumulatif seluruhnya"],
      ...report.alloc.days.map(d=>[d.date,d.allocT,d.alloc,d.cumAllocT,d.cumAlloc])] },
    { name: "Rekonsiliasi", rows: [["Invoice", "Invoice pengganti", "Target", "Sisa", "Terkumpul", "Dibayar bulan target", "Dibayar bulan lain", "Selisih", "Kategori"],
      ...report.recon.categories.flatMap(c=>c.rows.map(r=>[r.invoice_no,r.pengganti,r.target,r.sisa,r.terkumpul,r.dibayar,r.dibayarLain,r.selisih,c.label]))] },
  ];
}

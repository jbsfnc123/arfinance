// Bentuk hasil RPC get_spv_summary (port getSpvSummary di Code.gs).

export type GroupRow = {
  nama: string;
  target: number;
  sisa: number;
  terkumpul: number;
  pencapaian: number;
  invTotal: number;
  invLunas: number;
  invBelum: number;
  janjiNom: number;
  janjiCount: number;
};

export type OverdueRow = { bp: string; count: number; maxDays: number | null; total: number; marketing: string };

export type ForecastRow = {
  date: string;
  market: string;
  nom: number;
  count: number;
  bps: { bp: string; nom: number; count: number }[];
};

export type SpvSummary = {
  month: string;
  target: number;
  sisa: number;
  terkumpul: number;
  pencapaian: number;
  forecast: number;
  forecastCount: number;
  invTotal: number;
  invLunas: number;
  invBelum: number;
  totalNominal: number;
  totalInv: number;
  agData: Record<string, { count: number; nominal: number }>;
  caseData: { count: number; nom: number };
  byMarket: GroupRow[];
  byBranch: GroupRow[];
  byColl: GroupRow[];
  topOverdue: OverdueRow[];
  topOverdueByMarket: Record<string, OverdueRow[]>;
  forecastByDate: ForecastRow[];
  marketingList: string[];
  lastTagihanUpdate: string | null;
  /** Fase 89: invoice target yang belum lunas (dasar kartu Business Partner Outstanding). Opsional: tambahan, bukan aritmetika lama. */
  openInvoices?: OpenInvoice[];
};

/** Invoice target belum lunas: days = hari lewat jatuh tempo per cut off (> 0 = overdue; null = tanpa jatuh tempo). */
export type OpenInvoice = { bp: string; mkt: string; coll: string; sisa: number; days: number | null };
export type BpOutMode = "all" | "overdue" | "not";
export type BpOutRow = { bp: string; marketing: string; collection: string; count: number; outstanding: number; overdue: number; notOverdue: number };

/**
 * Fase 89 — Business Partner yang masih outstanding (invoice target bulan terpilih). Filter Marketing / Collection di tingkat
 * invoice. Mode: all = semua BP outstanding (urut outstanding); overdue = BP dengan overdue > 0 (urut overdue);
 * not = BP dengan nilai belum jatuh tempo > 0 (urut nilai itu). Tanpa jatuh tempo dihitung belum jatuh tempo.
 */
export function bpOutstanding(list: readonly OpenInvoice[], f: { mode: BpOutMode; mkt?: string; coll?: string }) {
  const scoped = list.filter((r) => r.sisa > 0 && (!f.mkt || r.mkt === f.mkt) && (!f.coll || r.coll === f.coll));
  const by = new Map<string, { row: BpOutRow; mkts: Set<string>; colls: Set<string> }>();
  for (const r of scoped) {
    const g = by.get(r.bp) ?? { row: { bp: r.bp, marketing: "", collection: "", count: 0, outstanding: 0, overdue: 0, notOverdue: 0 }, mkts: new Set<string>(), colls: new Set<string>() };
    g.row.count++; g.row.outstanding += r.sisa;
    if (r.days !== null && r.days > 0) g.row.overdue += r.sisa; else g.row.notOverdue += r.sisa;
    g.mkts.add(r.mkt); g.colls.add(r.coll);
    by.set(r.bp, g);
  }
  const key = (r: BpOutRow) => (f.mode === "overdue" ? r.overdue : f.mode === "not" ? r.notOverdue : r.outstanding);
  const rows = [...by.values()].map((g) => ({ ...g.row, marketing: [...g.mkts].sort().join(", "), collection: [...g.colls].sort().join(", ") }))
    .filter((r) => key(r) > 0)
    .sort((a, b) => key(b) - key(a) || a.bp.localeCompare(b.bp, "id"));
  return {
    rows,
    marketingList: [...new Set(list.map((r) => r.mkt))].sort((a, b) => a.localeCompare(b, "id")),
    collectionList: [...new Set(list.map((r) => r.coll))].sort((a, b) => a.localeCompare(b, "id")),
  };
}

// Warna pencapaian lama: >= 80 hijau, >= 50 kuning, sisanya merah.
export { pctColor } from "@/lib/ui/palette";

export const round1 = (x: number) => Math.round(x * 10) / 10;

// Kelompokkan janji bayar per tanggal (baris tanggal → marketing → BP).
export function forecastByDay(rows: ForecastRow[]) {
  const map = new Map<string, { date: string; nom: number; count: number; markets: ForecastRow[] }>();
  for (const r of rows) {
    const d = map.get(r.date) ?? { date: r.date, nom: 0, count: 0, markets: [] };
    d.nom += Number(r.nom);
    d.count += r.count;
    d.markets.push(r);
    map.set(r.date, d);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

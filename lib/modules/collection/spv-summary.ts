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
};

// Warna pencapaian lama: >= 80 hijau, >= 50 kuning, sisanya merah.
export const pctColor = (pct: number) => (pct >= 80 ? "#23ad7a" : pct >= 50 ? "#eebb3c" : "#e25b5b");

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

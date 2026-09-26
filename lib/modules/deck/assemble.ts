// Presentasi AR: susun `state` app lama dari tabel per bulan, dan hitung perubahan yang perlu disimpan.
// Bentuk state tetap sama dengan public/presentasi-app/js/data/state.js — app tidak perlu diubah.

export type Series = Record<string, Record<string, number>>; // key → { 'YYYY-MM': nilai }
export type MetricRow = { month: string; key: string; source: "excel" | "raw" | "auto" | "manual"; value: number | string };
export type ManualTables = Record<string, Record<string, unknown>[]>; // nama tabel → baris (tiap baris punya Bulan)
export type Texts = Record<string, Record<string, string>>; // bulan → { slideKey: teks }

const put = (s: Series, key: string, month: string, v: number) => { (s[key] ??= {})[month] = v; };

// Seri penjualan (sheet Input baris 6–42: Sales, Sales historis, Invoice Amount/Count per TOP·Ex DO·CBD untuk
// All/Traditional/Reseller, BP Reseller aktif). Untuk bulan yang punya riwayat Excel, Excel-lah acuannya — data
// ERP bulan lama belum lengkap (hanya invoice yang belum lunas), sehingga nilai raw bulan itu diabaikan.
export const SALES_HISTORY_KEY = /^(sales|sales_hist|(amt|cnt)_(all|trad|res):\d|bp_res:\d)$/;

// Layer app: manual > raw > excel. Seri 'auto' (Collection dari Target & ERP) masuk layer raw,
// hanya bila bulan/kunci itu belum punya nilai raw. Pengecualian: SALES_HISTORY_KEY (lihat di atas).
export function layersFrom(metrics: MetricRow[], derivedOpen: Series, autoOpen: Series) {
  const manual: Series = {}, excel: Series = {}, raw: Series = {};
  for (const [k, byM] of Object.entries(derivedOpen)) for (const [m, v] of Object.entries(byM)) put(raw, k, m, v);
  const auto: Series = structuredClone(autoOpen);
  for (const r of metrics) {
    const v = Number(r.value);
    if (!Number.isFinite(v)) continue;
    if (r.source === "manual") put(manual, r.key, r.month, v);
    else if (r.source === "excel") put(excel, r.key, r.month, v);
    else if (r.source === "raw") put(raw, r.key, r.month, v);
    else put(auto, r.key, r.month, v);
  }
  for (const [k, byM] of Object.entries(auto)) for (const [m, v] of Object.entries(byM)) if (raw[k]?.[m] === undefined) put(raw, k, m, v);
  for (const [k, byM] of Object.entries(excel)) {
    if (!SALES_HISTORY_KEY.test(k) || !raw[k]) continue;
    for (const m of Object.keys(byM)) delete raw[k][m];
    if (!Object.keys(raw[k]).length) delete raw[k];
  }
  return { manual, excel, raw };
}

// ── Perubahan untuk disimpan (deck_save) ─────────────────────────
export type Saved = { manual: Series; excel: Series; tables: ManualTables; texts: Texts };
export type SaveDiff = {
  metrics: { month: string; key: string; source: "manual" | "excel"; value: number; label?: string | null }[];
  deletes: { month: string; key: string; source: "manual" | "excel" }[];
  rows: { month: string; table_name: string; rows: Record<string, unknown>[] }[];
  texts: { month: string; slide_key: string; text: string }[];
  skipped: string[]; // bulan tertutup yang perubahannya diabaikan
};

const byMonth = (rows: Record<string, unknown>[] = []) => {
  const m = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) { const b = String(r.Bulan ?? ""); if (/^\d{4}-\d{2}$/.test(b)) (m.get(b) ?? m.set(b, []).get(b)!).push(r); }
  return m;
};

export function diffSaved(prev: Saved, next: Saved, closed: Set<string>, labels: Record<string, string> = {}): SaveDiff {
  const d: SaveDiff = { metrics: [], deletes: [], rows: [], texts: [], skipped: [] };
  const skip = (m: string) => { if (closed.has(m)) { if (!d.skipped.includes(m)) d.skipped.push(m); return true; } return false; };

  for (const source of ["manual", "excel"] as const) {
    const a = prev[source], b = next[source];
    for (const [k, byM] of Object.entries(b)) for (const [m, v] of Object.entries(byM)) {
      if (!Number.isFinite(Number(v)) || a[k]?.[m] === v) continue;
      if (!skip(m)) d.metrics.push({ month: m, key: k, source, value: Number(v), label: labels[k] ?? null });
    }
    for (const [k, byM] of Object.entries(a)) for (const m of Object.keys(byM)) {
      if (b[k]?.[m] !== undefined && Number.isFinite(Number(b[k][m]))) continue;
      if (!skip(m)) d.deletes.push({ month: m, key: k, source });
    }
  }

  for (const t of new Set([...Object.keys(prev.tables), ...Object.keys(next.tables)])) {
    const a = byMonth(prev.tables[t]), b = byMonth(next.tables[t]);
    for (const m of new Set([...a.keys(), ...b.keys()])) {
      if (JSON.stringify(a.get(m) ?? []) === JSON.stringify(b.get(m) ?? [])) continue;
      if (!skip(m)) d.rows.push({ month: m, table_name: t, rows: b.get(m) ?? [] });
    }
  }

  for (const m of new Set([...Object.keys(prev.texts), ...Object.keys(next.texts)])) {
    const a = prev.texts[m] ?? {}, b = next.texts[m] ?? {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if ((a[k] ?? "") === (b[k] ?? "")) continue;
      if (!skip(m)) d.texts.push({ month: m, slide_key: k, text: b[k] ?? "" });
    }
  }
  d.skipped.sort();
  return d;
}

export const isEmptyDiff = (d: SaveDiff) => !d.metrics.length && !d.deletes.length && !d.rows.length && !d.texts.length;

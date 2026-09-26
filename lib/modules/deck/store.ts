import { emptyMonth, GROUPS, LABELS, type MonthData } from "./template";

const CATS = ["TOP", "Ex DO", "CBD"];
const SITES = ["Banjarmasin", "DKI Jakarta", "Makassar", "Palembang", "Pontianak", "Surabaya"];
const AGING = ["Due 1-15", "Due 16-30", "Due 31-60", "Due 61-90", "Due >90", "Bad Debt"];

// Label pendek yang dipakai grafik app (seperti kolom "Seri" di workbook lama).
export function appLabel(key: string) {
  const m = /^([a-z0-9_]+):(\d+)$/.exec(key);
  if (m) {
    const [, base, i] = m;
    const n = Number(i);
    if (/^(amt|cnt)_(all|trad|res)$|^bp_res$/.test(base)) return CATS[n] ?? key;
    if (/^s7_/.test(base)) return SITES[n] ?? key;
    if (/^(coll_tgt|coll_act|coll_w|tgt_next|baddebt)$/.test(base)) return GROUPS[n] ?? key;
    if (base === "aging") return AGING[n] ?? key;
  }
  return LABELS[key] ?? key;
}

// Data Presentasi AR per bulan disimpan sebagai JSON terkompresi (gzip → base64) di deck_months.data.
// Kompresi memakai CompressionStream bawaan browser (juga tersedia di Node ≥ 18).

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
const toB64 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function compressJson(v: unknown): Promise<string> {
  return toB64(await pipe(new TextEncoder().encode(JSON.stringify(v)), new CompressionStream("gzip")));
}
export async function decompressJson<T>(b64: string): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await pipe(fromB64(b64), new DecompressionStream("gzip")))) as T;
}

export async function decodeMonth(b64: string): Promise<MonthData> {
  const d = await decompressJson<Partial<MonthData>>(b64);
  return { ...emptyMonth(), ...d, v: 1 };
}

// State app presentasi (bentuk state.js lama) dari data per bulan. Tidak ada data mentah / per BP.
export function deckState(months: { month: string; data: MonthData }[], config: { month?: string; week?: number } = {}) {
  const manual: Record<string, Record<string, number>> = {};
  const tables: Record<string, Record<string, unknown>[]> = {};
  const texts: Record<string, Record<string, string>> = {};
  for (const { month, data } of [...months].sort((a, b) => a.month.localeCompare(b.month))) {
    for (const [k, v] of Object.entries(data.series)) if (Number.isFinite(v)) (manual[k] ??= {})[month] = v;
    for (const [t, rows] of Object.entries(data.tables)) for (const r of rows) (tables[t] ??= []).push({ ...r, Bulan: month });
    if (Object.keys(data.texts).length) texts[month] = { ...data.texts };
  }
  const latest = months.map((m) => m.month).sort().pop() ?? "";
  const month = config.month && months.some((m) => m.month === config.month) ? config.month : latest;
  const week = manual.coll_week?.[month] ?? config.week ?? 2;
  const labels = Object.fromEntries([...new Set([...Object.keys(LABELS), ...Object.keys(manual)])].map((k) => [k, appLabel(k)]));
  return {
    version: 3, savedAt: null, config: { month, week }, labels,
    layers: { manual, raw: {}, excel: {} },
    bpSales: {}, bpAging: {}, payments: {}, bpMaster: {}, bpMasterInfo: null,
    manual: tables, texts, imports: [],
  };
}

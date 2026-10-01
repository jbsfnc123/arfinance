// Monitor Surat Jalan (Fase 46) — SATU definisi untuk Dashboard, Kertas Kerja, ekspor, dan pratinjau upload.
//
// Model (keputusan user 2026-10-01):
// - Daftar yang dipantau = semua No SJ di Aging terbaru (No SJ gabungan "SJ/a-SJ/b" dipecah; server: sj_aging_keys).
// - Per SJ hanya disimpan Receive Date & Receiver (tabel sj_receipts); upload berikutnya hanya mengisi SJ yang belum punya
//   Receive Date. SJ yang keluar dari aging terbaru → penerimaannya dihapus (trigger server).
// - Receiver diakui = nama aktif di daftar (trim + spasi tunggal + tanpa beda kapital, tanpa fuzzy). Filter berlaku saat
//   upload DAN saat menampilkan: penerimaan oleh Receiver yang kemudian dinonaktifkan dihitung Belum diterima.
// - Tanggal awal = Invoice Date aging (terkecil bila satu SJ punya beberapa invoice).
//   Durasi = Receive Date − Invoice Date (hari kalender); negatif / tanggal masa depan → masalah data, keluar dari
//   rata-rata (tidak dijadikan 0). Umur belum diterima = hari ini (Asia/Jakarta) − Invoice Date.

export type SjAging = { sj_key: string; invoice_date: string | null; invoice_no: string | null; business_partner: string | null; area: string | null; invoices: number };
export type SjReceipt = { sj_key: string; sj_no: string; receive_date: string; receiver: string; file_name: string | null; recorded_at: string };
export type SjReceiver = { id: number; name: string; active: boolean };

export const STATUS_DONE = "Sudah diterima";
export const STATUS_OPEN = "Belum diterima";
export const FLAG = {
  noInvoiceDate: "Invoice Date kosong",
  negative: "Durasi negatif",
  future: "Tanggal masa depan",
  inactive: "Receiver tidak aktif lagi",
} as const;

export type SjRow = {
  sj_key: string; sj_no: string; invoice_date: string | null; invoice_no: string | null; invoices: number;
  business_partner: string | null; area: string | null;
  status: typeof STATUS_DONE | typeof STATUS_OPEN;
  receiver: string | null; receive_date: string | null;
  durasi: number | null; umur: number | null; flags: string[]; flag_text: string; perlu_cek: boolean;
};

export const normName = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
export const activeSet = (receivers: readonly SjReceiver[]) => new Set(receivers.filter((r) => r.active).map((r) => normName(r.name)));
/** Nama baku per nama ternormalisasi (dari daftar Receiver): "BINTANG  anugia" di file → "Bintang Anugia Arragi". */
export const receiverNames = (receivers: readonly SjReceiver[]) => new Map(receivers.map((r) => [normName(r.name), r.name]));
export const sjKey = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

const dayNum = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5;
export const daysBetween = (from: string, to: string) => Math.round(dayNum(to) - dayNum(from));

/** Satu baris per SJ aging terbaru, digabung dengan penerimaan tersimpan. */
export function buildRows(
  aging: readonly SjAging[], receipts: readonly SjReceipt[], recognized: ReadonlySet<string>, today: string,
  names: ReadonlyMap<string, string> = new Map(),
): SjRow[] {
  const byKey = new Map(receipts.map((r) => [r.sj_key, r]));
  return aging.map((a) => {
    const rc = byKey.get(a.sj_key);
    const ok = !!rc && recognized.has(normName(rc.receiver));
    const flags: string[] = [];
    if (rc && !ok) flags.push(FLAG.inactive);
    const tgl = a.invoice_date;
    if (!tgl) flags.push(FLAG.noInvoiceDate);
    const future = (d: string | null | undefined) => !!d && d > today;
    if (future(tgl) || (ok && future(rc!.receive_date))) flags.push(FLAG.future);
    let durasi: number | null = null, umur: number | null = null;
    if (ok && tgl && !future(tgl) && !future(rc!.receive_date)) {
      const d = daysBetween(tgl, rc!.receive_date);
      if (d < 0) flags.push(FLAG.negative); else durasi = d;
    } else if (!ok && tgl && !future(tgl)) umur = daysBetween(tgl, today);
    return {
      sj_key: a.sj_key, sj_no: rc?.sj_no ?? a.sj_key, invoice_date: tgl, invoice_no: a.invoice_no, invoices: a.invoices,
      business_partner: a.business_partner, area: a.area,
      status: ok ? STATUS_DONE : STATUS_OPEN, receiver: ok ? names.get(normName(rc!.receiver)) ?? rc!.receiver : null, receive_date: ok ? rc!.receive_date : null,
      durasi, umur, flags, flag_text: flags.join(", "), perlu_cek: flags.length > 0,
    };
  });
}

// ── Filter bersama (Dashboard & Kertas Kerja) ─────────────────────────
export type SjFilter = { from: string; to: string; area: string };
export function filterRows(rows: readonly SjRow[], f: SjFilter): SjRow[] {
  return rows.filter((r) =>
    (!f.from || (r.invoice_date !== null && r.invoice_date >= f.from)) &&
    (!f.to || (r.invoice_date !== null && r.invoice_date <= f.to)) &&
    (!f.area || r.area === f.area));
}

/** Periode bawaan: bulan Invoice Date terbaru (yang tidak di masa depan). */
export function defaultPeriod(rows: readonly SjRow[], today: string): { from: string; to: string } {
  let max = "";
  for (const r of rows) if (r.invoice_date && r.invoice_date <= today && r.invoice_date > max) max = r.invoice_date;
  if (!max) return { from: "", to: "" };
  const y = +max.slice(0, 4), m = +max.slice(5, 7);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${max.slice(0, 7)}-01`, to: `${max.slice(0, 7)}-${String(last).padStart(2, "0")}` };
}

export const AGE_BUCKETS = [
  { label: "0–3 hari", min: 0, max: 3 }, { label: "4–7 hari", min: 4, max: 7 }, { label: "8–14 hari", min: 8, max: 14 },
  { label: "15–30 hari", min: 15, max: 30 }, { label: "> 30 hari", min: 31, max: Infinity },
] as const;

export type SjSummary = {
  total: number; done: number; open: number; pct: number | null;
  avg: number | null; sample: number; excluded: number; oldestOpen: SjRow | null;
  quality: { dateIssues: number; noInvoiceDate: number; inactive: number };
  trend: { date: string; done: number; open: number }[];
  ageBuckets: { label: string; count: number }[];
  byReceiver: { receiver: string; count: number; avg: number | null; sample: number }[];
  byArea: { area: string; total: number; done: number; open: number; pct: number; avg: number | null }[];
  topOpen: SjRow[];
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

/** Ringkasan dari baris hasil filter yang sama dengan Kertas Kerja. */
export function summarize(rows: readonly SjRow[]): SjSummary {
  const done = rows.filter((r) => r.status === STATUS_DONE);
  const open = rows.filter((r) => r.status === STATUS_OPEN);
  const durs = done.filter((r) => r.durasi !== null).map((r) => r.durasi!);
  const trendMap = new Map<string, { done: number; open: number }>();
  for (const r of rows) {
    if (!r.invoice_date) continue;
    const t = trendMap.get(r.invoice_date) ?? { done: 0, open: 0 };
    if (r.status === STATUS_DONE) t.done++; else t.open++;
    trendMap.set(r.invoice_date, t);
  }
  const recMap = new Map<string, { count: number; durs: number[] }>();
  for (const r of done) {
    const k = r.receiver ?? "-";
    const m = recMap.get(k) ?? { count: 0, durs: [] };
    m.count++; if (r.durasi !== null) m.durs.push(r.durasi);
    recMap.set(k, m);
  }
  const areaMap = new Map<string, { total: number; done: number; durs: number[] }>();
  for (const r of rows) {
    const k = r.area || "(tanpa Area)";
    const a = areaMap.get(k) ?? { total: 0, done: 0, durs: [] };
    a.total++; if (r.status === STATUS_DONE) { a.done++; if (r.durasi !== null) a.durs.push(r.durasi); }
    areaMap.set(k, a);
  }
  const openSorted = open.filter((r) => r.umur !== null).sort((a, b) => b.umur! - a.umur! || a.sj_no.localeCompare(b.sj_no));
  return {
    total: rows.length, done: done.length, open: open.length, pct: rows.length ? (done.length / rows.length) * 100 : null,
    avg: r1(mean(durs)), sample: durs.length, excluded: done.length - durs.length, oldestOpen: openSorted[0] ?? null,
    quality: {
      dateIssues: rows.filter((r) => r.flags.includes(FLAG.negative) || r.flags.includes(FLAG.future)).length,
      noInvoiceDate: rows.filter((r) => r.flags.includes(FLAG.noInvoiceDate)).length,
      inactive: rows.filter((r) => r.flags.includes(FLAG.inactive)).length,
    },
    trend: [...trendMap].sort(([a], [b]) => a.localeCompare(b)).map(([date, t]) => ({ date, ...t })),
    ageBuckets: AGE_BUCKETS.map((b) => ({ label: b.label, count: open.filter((r) => r.umur !== null && r.umur >= b.min && r.umur <= b.max).length })),
    byReceiver: [...recMap].map(([receiver, m]) => ({ receiver, count: m.count, avg: r1(mean(m.durs)), sample: m.durs.length })).sort((a, b) => b.count - a.count),
    byArea: [...areaMap].map(([area, a]) => ({ area, total: a.total, done: a.done, open: a.total - a.done, pct: (a.done / a.total) * 100, avg: r1(mean(a.durs)) }))
      .sort((a, b) => b.total - a.total),
    topOpen: openSorted.slice(0, 10),
  };
}

/** Tren: harian bila rentang ≤ 45 hari, selain itu per minggu (Senin). Label = tanggal awal kelompok. */
export function trendSeries(trend: SjSummary["trend"]): { label: string; weekly: boolean; done: number; open: number }[] {
  if (!trend.length) return [];
  const weekly = daysBetween(trend[0].date, trend[trend.length - 1].date) > 45;
  if (!weekly) return trend.map((t) => ({ label: t.date, weekly, done: t.done, open: t.open }));
  const m = new Map<string, { done: number; open: number }>();
  for (const t of trend) {
    const d = new Date(`${t.date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const k = d.toISOString().slice(0, 10);
    const g = m.get(k) ?? { done: 0, open: 0 };
    g.done += t.done; g.open += t.open;
    m.set(k, g);
  }
  return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([label, g]) => ({ label, weekly, ...g }));
}

/** Dampak perubahan daftar Receiver pada data tersimpan: jumlah SJ aging yang berubah status. */
export function receiverImpact(receipts: readonly SjReceipt[], agingKeys: ReadonlySet<string>, before: ReadonlySet<string>, after: ReadonlySet<string>) {
  let statusChanged = 0;
  for (const r of receipts) {
    if (!agingKeys.has(r.sj_key)) continue;
    const n = normName(r.receiver);
    if (before.has(n) !== after.has(n)) statusChanged++;
  }
  return { statusChanged };
}

/** Format rata-rata untuk UI: satu desimal, "—" bila sampel kosong (bukan 0 hari). */
export const fmtAvg = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} hari`);

// Monitor Surat Jalan — SATU definisi untuk Dashboard, Kertas Kerja, ekspor, dan pratinjau upload.
//
// Model (Fase 85, keputusan user 2026-11-20 — TIDAK bergantung pada Aging):
// - Daftar yang dipantau = semua SJ ("SJ/…") yang pernah muncul di "Laporan Serah Terima Surat Jalan By Shipment Date
//   (NEW)" (tabel sj_docs; diisi AR Bot / upload manual; tidak pernah dihapus karena Aging).
// - Per SJ disimpan Receive Date & Receiver pertama yang diakui (tabel sj_receipts); upload berikutnya hanya mengisi SJ yang
//   belum punya Receive Date.
// - Receiver diakui = nama aktif di daftar (trim + spasi tunggal + tanpa beda kapital, tanpa fuzzy). Filter berlaku saat
//   upload DAN saat menampilkan: penerimaan oleh Receiver yang kemudian dinonaktifkan dihitung Belum diterima.
// - Tanggal awal = Tanggal SJ (laporan). Durasi = Receive Date − Tanggal SJ (hari kalender); negatif / tanggal masa depan →
//   masalah data, keluar dari rata-rata (tidak dijadikan 0). Umur belum diterima = hari ini (Asia/Jakarta) − Tanggal SJ.
// - Filter: periode Tanggal SJ + Area + Locator (dari laporan).

/** Dokumen SJ dari laporan (pack_sj.docs). */
export type SjDocRec = {
  sj_key: string; sj_no: string; tanggal_sj: string | null; area: string | null; business_partner: string | null;
  locator: string | null; send_date: string | null;
};
export type SjReceipt = { sj_key: string; sj_no: string; receive_date: string; receiver: string; file_name: string | null; recorded_at: string };
export type SjReceiver = { id: number; name: string; active: boolean };

export const STATUS_DONE = "Sudah diterima";
export const STATUS_OPEN = "Belum diterima";
export const FLAG = {
  noTanggalSj: "Tanggal SJ kosong",
  negative: "Durasi negatif",
  future: "Tanggal masa depan",
  inactive: "Receiver tidak aktif lagi",
} as const;

export type SjRow = {
  sj_key: string; sj_no: string; tanggal_sj: string | null; send_date: string | null;
  business_partner: string | null; area: string | null; locator: string | null;
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

/** Satu baris per SJ dari laporan Serah Terima, digabung dengan penerimaan tersimpan. */
export function buildRows(
  docs: readonly SjDocRec[], receipts: readonly SjReceipt[], recognized: ReadonlySet<string>, today: string,
  names: ReadonlyMap<string, string> = new Map(),
): SjRow[] {
  const byKey = new Map(receipts.map((r) => [r.sj_key, r]));
  return docs.map((a) => {
    const rc = byKey.get(a.sj_key);
    const ok = !!rc && recognized.has(normName(rc.receiver));
    const flags: string[] = [];
    if (rc && !ok) flags.push(FLAG.inactive);
    const tgl = a.tanggal_sj;
    if (!tgl) flags.push(FLAG.noTanggalSj);
    const future = (d: string | null | undefined) => !!d && d > today;
    if (future(tgl) || (ok && future(rc!.receive_date))) flags.push(FLAG.future);
    let durasi: number | null = null, umur: number | null = null;
    if (ok && tgl && !future(tgl) && !future(rc!.receive_date)) {
      const d = daysBetween(tgl, rc!.receive_date);
      if (d < 0) flags.push(FLAG.negative); else durasi = d;
    } else if (!ok && tgl && !future(tgl)) umur = daysBetween(tgl, today);
    return {
      sj_key: a.sj_key, sj_no: a.sj_no || rc?.sj_no || a.sj_key, tanggal_sj: tgl, send_date: a.send_date,
      business_partner: a.business_partner, area: a.area, locator: a.locator,
      status: ok ? STATUS_DONE : STATUS_OPEN, receiver: ok ? names.get(normName(rc!.receiver)) ?? rc!.receiver : null, receive_date: ok ? rc!.receive_date : null,
      durasi, umur, flags, flag_text: flags.join(", "), perlu_cek: flags.length > 0,
    };
  });
}

// ── Filter bersama (Dashboard & Kertas Kerja) ─────────────────────────
export type SjFilter = { from: string; to: string; area: string; locator: string };
const inPeriod = (r: SjRow, f: SjFilter) =>
  (!f.from || (r.tanggal_sj !== null && r.tanggal_sj >= f.from)) && (!f.to || (r.tanggal_sj !== null && r.tanggal_sj <= f.to));
export function filterRows(rows: readonly SjRow[], f: SjFilter): SjRow[] {
  return rows.filter((r) => inPeriod(r, f) && (!f.area || r.area === f.area) && (!f.locator || r.locator === f.locator));
}

/**
 * Opsi filter dinamis: Area dihitung dari baris yang lolos periode + Locator terpilih, dan sebaliknya (dengan jumlah SJ).
 * Pilihan aktif tetap ada walau jumlahnya 0 agar bisa dikosongkan.
 */
export function filterChoices(rows: readonly SjRow[], f: SjFilter) {
  const count = (pick: (r: SjRow) => string, keep: (r: SjRow) => boolean, active: string) => {
    const m = new Map<string, number>();
    for (const r of rows) if (inPeriod(r, f) && keep(r)) { const v = pick(r); if (v) m.set(v, (m.get(v) ?? 0) + 1); }
    if (active && !m.has(active)) m.set(active, 0);
    return [...m].sort((a, b) => a[0].localeCompare(b[0], "id")).map(([value, n]) => ({ value, n }));
  };
  return {
    area: count((r) => r.area ?? "", (r) => !f.locator || r.locator === f.locator, f.area),
    locator: count((r) => r.locator ?? "", (r) => !f.area || r.area === f.area, f.locator),
  };
}

/** Periode bawaan: bulan Tanggal SJ terbaru (yang tidak di masa depan). */
export function defaultPeriod(rows: readonly SjRow[], today: string): { from: string; to: string } {
  let max = "";
  for (const r of rows) if (r.tanggal_sj && r.tanggal_sj <= today && r.tanggal_sj > max) max = r.tanggal_sj;
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
  quality: { dateIssues: number; noTanggalSj: number; inactive: number };
  trend: { date: string; done: number; open: number }[];
  ageBuckets: { label: string; count: number }[];
  byLocator: { locator: string; total: number; done: number; open: number; pct: number; avg: number | null }[];
  byArea: { area: string; total: number; done: number; open: number; pct: number; avg: number | null }[];
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

/** Rekap per kelompok (Area / Locator): total, sudah, belum, % sudah, rata-rata durasi. Urut total terbesar. */
function group(rows: readonly SjRow[], key: (r: SjRow) => string) {
  const m = new Map<string, { total: number; done: number; durs: number[] }>();
  for (const r of rows) {
    const k = key(r);
    const g = m.get(k) ?? { total: 0, done: 0, durs: [] };
    g.total++; if (r.status === STATUS_DONE) { g.done++; if (r.durasi !== null) g.durs.push(r.durasi); }
    m.set(k, g);
  }
  return [...m].map(([k, g]) => [k, { total: g.total, done: g.done, open: g.total - g.done, pct: (g.done / g.total) * 100, avg: r1(mean(g.durs)) }] as const)
    .sort((a, b) => b[1].total - a[1].total);
}

/** Ringkasan dari baris hasil filter yang sama dengan Kertas Kerja. */
export function summarize(rows: readonly SjRow[]): SjSummary {
  const done = rows.filter((r) => r.status === STATUS_DONE);
  const open = rows.filter((r) => r.status === STATUS_OPEN);
  const durs = done.filter((r) => r.durasi !== null).map((r) => r.durasi!);
  const trendMap = new Map<string, { done: number; open: number }>();
  for (const r of rows) {
    if (!r.tanggal_sj) continue;
    const t = trendMap.get(r.tanggal_sj) ?? { done: 0, open: 0 };
    if (r.status === STATUS_DONE) t.done++; else t.open++;
    trendMap.set(r.tanggal_sj, t);
  }
  const openSorted = open.filter((r) => r.umur !== null).sort((a, b) => b.umur! - a.umur! || a.sj_no.localeCompare(b.sj_no));
  return {
    total: rows.length, done: done.length, open: open.length, pct: rows.length ? (done.length / rows.length) * 100 : null,
    avg: r1(mean(durs)), sample: durs.length, excluded: done.length - durs.length, oldestOpen: openSorted[0] ?? null,
    quality: {
      dateIssues: rows.filter((r) => r.flags.includes(FLAG.negative) || r.flags.includes(FLAG.future)).length,
      noTanggalSj: rows.filter((r) => r.flags.includes(FLAG.noTanggalSj)).length,
      inactive: rows.filter((r) => r.flags.includes(FLAG.inactive)).length,
    },
    trend: [...trendMap].sort(([a], [b]) => a.localeCompare(b)).map(([date, t]) => ({ date, ...t })),
    ageBuckets: AGE_BUCKETS.map((b) => ({ label: b.label, count: open.filter((r) => r.umur !== null && r.umur >= b.min && r.umur <= b.max).length })),
    byLocator: group(rows, (r) => r.locator || "(tanpa Locator)").map(([locator, a]) => ({ locator, ...a })),
    byArea: group(rows, (r) => r.area || "(tanpa Area)").map(([area, a]) => ({ area, ...a })),
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

/** Dampak perubahan daftar Receiver pada data tersimpan: jumlah SJ dipantau yang berubah status. */
export function receiverImpact(receipts: readonly SjReceipt[], docKeys: ReadonlySet<string>, before: ReadonlySet<string>, after: ReadonlySet<string>) {
  let statusChanged = 0;
  for (const r of receipts) {
    if (!docKeys.has(r.sj_key)) continue;
    const n = normName(r.receiver);
    if (before.has(n) !== after.has(n)) statusChanged++;
  }
  return { statusChanged };
}

/** Format rata-rata untuk UI: satu desimal, "—" bila sampel kosong (bukan 0 hari). */
export const fmtAvg = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} hari`);

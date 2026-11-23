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
// - Filter: periode Tanggal SJ + Area + Business Partner (Fase 86); BP/Area yang tidak dicentang di Setting tidak tampil.
// - Dashboard (Fase 86): ringkasan per Business Partner per bulan Tanggal SJ (SJ / Sudah / Belum).

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

// ── Tampilan (Fase 86): BP / Area yang tidak dicentang di Setting tidak tampil di Dashboard & Kertas Kerja ─────
export const NO_BP = "(tanpa Business Partner)";
export const NO_AREA = "(tanpa Area)";
export const bpOf = (r: { business_partner: string | null }) => r.business_partner?.trim() || NO_BP;
export const areaOf = (r: { area: string | null }) => r.area?.trim() || NO_AREA;
export type SjHidden = { bp: ReadonlySet<string>; area: ReadonlySet<string> };
export function hiddenSets(list: readonly { kind: string; value: string }[] | undefined): SjHidden {
  const bp = new Set<string>(), area = new Set<string>();
  for (const h of list ?? []) (h.kind === "area" ? area : bp).add(h.value);
  return { bp, area };
}
export function applyVisibility(rows: readonly SjRow[], hidden: SjHidden): SjRow[] {
  if (!hidden.bp.size && !hidden.area.size) return rows as SjRow[];
  return rows.filter((r) => !hidden.bp.has(bpOf(r)) && !hidden.area.has(areaOf(r)));
}

// ── Filter bersama (Dashboard & Kertas Kerja) ─────────────────────────
export type SjFilter = { from: string; to: string; area: string; bp: string };
const inPeriod = (r: SjRow, f: SjFilter) =>
  (!f.from || (r.tanggal_sj !== null && r.tanggal_sj >= f.from)) && (!f.to || (r.tanggal_sj !== null && r.tanggal_sj <= f.to));
export function filterRows(rows: readonly SjRow[], f: SjFilter): SjRow[] {
  return rows.filter((r) => inPeriod(r, f) && (!f.area || areaOf(r) === f.area) && (!f.bp || bpOf(r) === f.bp));
}

/**
 * Opsi filter dinamis: Area dihitung dari baris yang lolos periode + BP terpilih, dan sebaliknya (dengan jumlah SJ).
 * Pilihan aktif tetap ada walau jumlahnya 0 agar bisa dikosongkan.
 */
export function filterChoices(rows: readonly SjRow[], f: SjFilter) {
  const count = (pick: (r: SjRow) => string, keep: (r: SjRow) => boolean, active: string) => {
    const m = new Map<string, number>();
    for (const r of rows) if (inPeriod(r, f) && keep(r)) { const v = pick(r); m.set(v, (m.get(v) ?? 0) + 1); }
    if (active && !m.has(active)) m.set(active, 0);
    return [...m].sort((a, b) => a[0].localeCompare(b[0], "id")).map(([value, n]) => ({ value, n }));
  };
  return {
    area: count(areaOf, (r) => !f.bp || bpOf(r) === f.bp, f.area),
    bp: count(bpOf, (r) => !f.area || areaOf(r) === f.area, f.bp),
  };
}

// ── Dashboard (Fase 86): ringkasan per Business Partner per bulan Tanggal SJ ──────────────────────
export const NO_MONTH = "(tanpa tanggal)";
export type BpMonthCell = { n: number; done: number; open: number };
export type BpMonthRow = { bp: string; total: number; done: number; open: number; pct: number; months: Record<string, BpMonthCell> };

/** Satu baris per BP; kolom per bulan (YYYY-MM, urut naik; SJ tanpa Tanggal SJ → "(tanpa tanggal)" di akhir). */
export function bpMonthSummary(rows: readonly SjRow[]): { months: string[]; rows: BpMonthRow[]; total: BpMonthCell } {
  const by = new Map<string, BpMonthRow>();
  const months = new Set<string>();
  const total: BpMonthCell = { n: 0, done: 0, open: 0 };
  for (const r of rows) {
    const bp = bpOf(r), m = r.tanggal_sj ? r.tanggal_sj.slice(0, 7) : NO_MONTH;
    months.add(m);
    const g = by.get(bp) ?? { bp, total: 0, done: 0, open: 0, pct: 0, months: {} };
    const c = (g.months[m] ??= { n: 0, done: 0, open: 0 });
    const done = r.status === STATUS_DONE ? 1 : 0;
    c.n++; c.done += done; c.open += 1 - done;
    g.total++; g.done += done; g.open += 1 - done;
    total.n++; total.done += done; total.open += 1 - done;
    by.set(bp, g);
  }
  for (const g of by.values()) g.pct = g.total ? (g.done / g.total) * 100 : 0;
  const ms = [...months].sort((a, b) => (a === NO_MONTH ? 1 : b === NO_MONTH ? -1 : a.localeCompare(b)));
  return { months: ms, rows: [...by.values()].sort((a, b) => b.total - a.total || a.bp.localeCompare(b.bp, "id")), total };
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

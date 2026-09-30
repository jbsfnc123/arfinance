// Monitor Surat Jalan — SATU definisi aturan pengakuan & deduplikasi untuk Dashboard, Kertas Kerja, dan ekspor.
//
// Aturan (brief Fase 45):
// - Identitas surat jalan = sj_key (upper(trim(SJ No.))). Semua baris sumber dengan sj_key sama = riwayat satu SJ.
// - Receiver diakui = nama aktif di daftar Receiver; cocok setelah trim, spasi berulang dirapikan, tanpa beda kapital.
//   Tanpa fuzzy. Receiver kosong / di luar daftar tidak pernah menjadi bukti penerimaan.
// - Acuan = kejadian PERTAMA dengan Receiver diakui menurut urutan sumber: (urutan upload terpublikasi, nomor baris).
//   Bukan urutan tabel, bukan tanggal terkecil. Receiver & Receive Date diambil dari baris acuan yang sama.
// - Receive Date acuan kosong/invalid → tetap "Sudah diterima" + "Tanggal terima belum valid"; acuan TIDAK diganti.
// - Durasi = Receive Date acuan − Tanggal SJ (hari kalender). Negatif / tanggal masa depan → masalah data, keluar
//   dari rata-rata (tidak dijadikan 0). Rata-rata = rata-rata seluruh durasi valid, satu per SJ.
// - Umur belum diterima = hari ini (Asia/Jakarta) − Tanggal SJ.

export type SjEvent = {
  id: number; seq: number; row_no: number; batch_id: number; sj_no: string; sj_key: string; area: string | null;
  tanggal_sj: string | null; tanggal_sj_raw: string | null; business_partner: string | null; locator: string | null;
  send_date: string | null; sender: string | null; receive_date: string | null; receive_date_raw: string | null;
  receiver: string | null; faktur: string | null; send_receipt_doc_no: string | null;
};
export type SjReceiver = { id: number; name: string; active: boolean };

export const STATUS_DONE = "Sudah diterima";
export const STATUS_OPEN = "Belum diterima";
export const FLAG = {
  multi: "Laporan penerimaan ganda",
  onlyOther: "Hanya Receiver di luar daftar",
  recvDateInvalid: "Tanggal terima belum valid",
  sjDateInvalid: "Tanggal SJ tidak valid",
  negative: "Durasi negatif",
  future: "Tanggal masa depan",
  dateNoReceiver: "Receive Date tanpa Receiver",
  mismatch: "SJ sama, Area/BP berbeda",
} as const;

export type SjRow = {
  sj_key: string; sj_no: string; tanggal_sj: string | null; tanggal_sj_raw: string | null; area: string | null;
  business_partner: string | null; locator: string | null;
  status: typeof STATUS_DONE | typeof STATUS_OPEN;
  receiver: string | null; receive_date: string | null; ref_event: number | null;
  durasi: number | null; umur: number | null;
  laporan: number; laporan_penerimaan: number; diakui: number; flags: string[]; flag_text: string; perlu_cek: boolean;
};

export const normName = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
export const activeSet = (receivers: readonly SjReceiver[]) => new Set(receivers.filter((r) => r.active).map((r) => normName(r.name)));

const dayNum = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5;
export const daysBetween = (from: string, to: string) => Math.round(dayNum(to) - dayNum(from));

/** Urutan sumber: upload terpublikasi lebih dulu, lalu nomor baris file. */
export const bySource = (a: SjEvent, b: SjEvent) => a.seq - b.seq || a.row_no - b.row_no || a.id - b.id;

/** Alasan per kejadian (untuk detail riwayat). */
export type EventRole = "acuan" | "diakui-setelah" | "tidak-diakui" | "kosong";
export const ROLE_LABEL: Record<EventRole, string> = {
  acuan: "Acuan penerimaan (pertama yang diakui)",
  "diakui-setelah": "Diakui, tetapi bukan yang pertama — disimpan sebagai riwayat",
  "tidak-diakui": "Receiver di luar daftar — bukan bukti penerimaan",
  kosong: "Receiver kosong — belum ada penerimaan",
};
export function eventRoles(events: readonly SjEvent[], recognized: ReadonlySet<string>): Map<number, EventRole> {
  const out = new Map<number, EventRole>();
  let found = false;
  for (const e of [...events].sort(bySource)) {
    const n = normName(e.receiver);
    if (!n) out.set(e.id, "kosong");
    else if (!recognized.has(n)) out.set(e.id, "tidak-diakui");
    else { out.set(e.id, found ? "diakui-setelah" : "acuan"); found = true; }
  }
  return out;
}

/** Satu baris per surat jalan unik. */
export function recognize(events: readonly SjEvent[], recognized: ReadonlySet<string>, today: string): SjRow[] {
  const groups = new Map<string, SjEvent[]>();
  for (const e of events) { const g = groups.get(e.sj_key); if (g) g.push(e); else groups.set(e.sj_key, [e]); }
  const rows: SjRow[] = [];
  for (const [key, list] of groups) {
    const evs = list.sort(bySource);
    const first = evs[0];
    const flags: string[] = [];
    let ref: SjEvent | null = null, diakui = 0, withReceiver = 0;
    for (const e of evs) {
      const n = normName(e.receiver);
      if (n) withReceiver++;
      if (n && recognized.has(n)) { diakui++; if (!ref) ref = e; }
    }
    if (diakui > 1) flags.push(FLAG.multi);
    if (!ref && withReceiver > 0) flags.push(FLAG.onlyOther);
    if (evs.some((e) => e.receive_date && !normName(e.receiver))) flags.push(FLAG.dateNoReceiver);
    if (new Set(evs.map((e) => `${e.area ?? ""}|${e.business_partner ?? ""}`)).size > 1) flags.push(FLAG.mismatch);
    const tSj = first.tanggal_sj;
    if (!tSj) flags.push(FLAG.sjDateInvalid);
    const future = (d: string | null) => !!d && d > today;
    if (future(tSj) || future(ref?.receive_date ?? null)) flags.push(FLAG.future);

    let durasi: number | null = null, umur: number | null = null;
    if (ref) {
      if (!ref.receive_date) flags.push(FLAG.recvDateInvalid);
      else if (tSj && !future(tSj) && !future(ref.receive_date)) {
        const d = daysBetween(tSj, ref.receive_date);
        if (d < 0) flags.push(FLAG.negative); else durasi = d;
      }
    } else if (tSj && !future(tSj)) umur = daysBetween(tSj, today);

    rows.push({
      sj_key: key, sj_no: first.sj_no, tanggal_sj: tSj, tanggal_sj_raw: first.tanggal_sj_raw, area: first.area,
      business_partner: first.business_partner, locator: first.locator,
      status: ref ? STATUS_DONE : STATUS_OPEN, receiver: ref?.receiver?.trim() ?? null, receive_date: ref?.receive_date ?? null,
      ref_event: ref?.id ?? null, durasi, umur,
      laporan: evs.length, laporan_penerimaan: withReceiver, diakui, flags, flag_text: flags.join(", "), perlu_cek: flags.length > 0,
    });
  }
  return rows;
}

// ── Filter bersama (Dashboard & Kertas Kerja) ─────────────────────────
export type SjFilter = { from: string; to: string; area: string };
export function filterRows(rows: readonly SjRow[], f: SjFilter): SjRow[] {
  return rows.filter((r) =>
    (!f.from || (r.tanggal_sj !== null && r.tanggal_sj >= f.from)) &&
    (!f.to || (r.tanggal_sj !== null && r.tanggal_sj <= f.to)) &&
    (!f.area || r.area === f.area));
}

export const AGE_BUCKETS = [
  { label: "0–3 hari", min: 0, max: 3 }, { label: "4–7 hari", min: 4, max: 7 }, { label: "8–14 hari", min: 8, max: 14 },
  { label: "15–30 hari", min: 15, max: 30 }, { label: "> 30 hari", min: 31, max: Infinity },
] as const;

export type SjSummary = {
  total: number; done: number; open: number; pct: number | null;
  avg: number | null; sample: number; excluded: number; oldestOpen: SjRow | null;
  quality: { multi: number; onlyOther: number; dateIssues: number; sourceRows: number; unique: number };
  trend: { date: string; done: number; open: number }[];
  ageBuckets: { label: string; count: number }[];
  byReceiver: { receiver: string; count: number; avg: number | null; sample: number }[];
  byArea: { area: string; total: number; done: number; open: number; pct: number; avg: number | null }[];
  topOpen: SjRow[];
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Ringkasan dari baris SJ unik (hasil filter yang sama dengan Kertas Kerja). sourceRows = jumlah baris sumber terkait. */
export function summarize(rows: readonly SjRow[]): SjSummary {
  const done = rows.filter((r) => r.status === STATUS_DONE);
  const open = rows.filter((r) => r.status === STATUS_OPEN);
  const durs = done.filter((r) => r.durasi !== null).map((r) => r.durasi!);
  const dateFlags: string[] = [FLAG.recvDateInvalid, FLAG.sjDateInvalid, FLAG.negative, FLAG.future];
  const trendMap = new Map<string, { done: number; open: number }>();
  for (const r of rows) {
    if (!r.tanggal_sj) continue;
    const t = trendMap.get(r.tanggal_sj) ?? { done: 0, open: 0 };
    if (r.status === STATUS_DONE) t.done++; else t.open++;
    trendMap.set(r.tanggal_sj, t);
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
    const k = r.area ?? "(tanpa Area)";
    const a = areaMap.get(k) ?? { total: 0, done: 0, durs: [] };
    a.total++; if (r.status === STATUS_DONE) { a.done++; if (r.durasi !== null) a.durs.push(r.durasi); }
    areaMap.set(k, a);
  }
  const openSorted = open.filter((r) => r.umur !== null).sort((a, b) => b.umur! - a.umur! || a.sj_no.localeCompare(b.sj_no));
  const avg = mean(durs);
  return {
    total: rows.length, done: done.length, open: open.length, pct: rows.length ? (done.length / rows.length) * 100 : null,
    avg: avg === null ? null : Math.round(avg * 10) / 10, sample: durs.length, excluded: done.length - durs.length,
    oldestOpen: openSorted[0] ?? null,
    quality: {
      multi: rows.filter((r) => r.laporan_penerimaan > 1).length,
      onlyOther: rows.filter((r) => r.flags.includes(FLAG.onlyOther)).length,
      dateIssues: rows.filter((r) => r.flags.some((f) => dateFlags.includes(f))).length,
      sourceRows: rows.reduce((a, r) => a + r.laporan, 0), unique: rows.length,
    },
    trend: [...trendMap].sort(([a], [b]) => a.localeCompare(b)).map(([date, t]) => ({ date, ...t })),
    ageBuckets: AGE_BUCKETS.map((b) => ({ label: b.label, count: open.filter((r) => r.umur !== null && r.umur >= b.min && r.umur <= b.max).length })),
    byReceiver: [...recMap].map(([receiver, m]) => {
      const a = mean(m.durs);
      return { receiver, count: m.count, avg: a === null ? null : Math.round(a * 10) / 10, sample: m.durs.length };
    }).sort((a, b) => b.count - a.count),
    byArea: [...areaMap].map(([area, a]) => {
      const av = mean(a.durs);
      return { area, total: a.total, done: a.done, open: a.total - a.done, pct: (a.done / a.total) * 100, avg: av === null ? null : Math.round(av * 10) / 10 };
    }).sort((a, b) => b.total - a.total),
    topOpen: openSorted.slice(0, 10),
  };
}

/** Dampak perubahan daftar Receiver: berapa SJ berubah status atau acuan (sebelum menyimpan). */
export function receiverImpact(events: readonly SjEvent[], before: ReadonlySet<string>, after: ReadonlySet<string>, today: string) {
  const a = new Map(recognize(events, before, today).map((r) => [r.sj_key, r]));
  let statusChanged = 0, refChanged = 0;
  for (const r of recognize(events, after, today)) {
    const o = a.get(r.sj_key)!;
    if (o.status !== r.status) statusChanged++;
    else if (o.ref_event !== r.ref_event) refChanged++;
  }
  return { statusChanged, refChanged };
}

/** Format rata-rata untuk UI: satu desimal, "—" bila sampel kosong (bukan 0 hari). */
export const fmtAvg = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} hari`);

/** Periode bawaan Dashboard/Kertas Kerja: bulan Tanggal SJ terbaru (yang tidak di masa depan). */
export function defaultPeriod(rows: readonly SjRow[], today: string): { from: string; to: string } {
  let max = "";
  for (const r of rows) if (r.tanggal_sj && r.tanggal_sj <= today && r.tanggal_sj > max) max = r.tanggal_sj;
  if (!max) return { from: "", to: "" };
  const y = +max.slice(0, 4), m = +max.slice(5, 7);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${max.slice(0, 7)}-01`, to: `${max.slice(0, 7)}-${String(last).padStart(2, "0")}` };
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

/** Ekspor riwayat sumber: SEMUA kejadian untuk SJ terpilih, urut sumber, dengan status SJ & alasan per baris. */
export const HISTORY_HEADER = [
  "SJ No.", "Tanggal SJ", "Area", "Business Partner", "Locator", "Status SJ", "Upload", "Baris sumber",
  "Send Date", "Sender", "Receive Date", "Receiver (asli)", "Faktur", "Send Receipt Doc No", "Peran baris",
] as const;
export function historyRows(
  rows: readonly SjRow[], eventsByKey: ReadonlyMap<string, readonly SjEvent[]>, recognized: ReadonlySet<string>,
  uploadLabel: (batchId: number) => string = (id) => `#${id}`,
): (string | number | null)[][] {
  const out: (string | number | null)[][] = [];
  for (const r of rows) {
    const evs = [...(eventsByKey.get(r.sj_key) ?? [])].sort(bySource);
    const roles = eventRoles(evs, recognized);
    for (const e of evs) {
      out.push([e.sj_no, e.tanggal_sj ?? e.tanggal_sj_raw, e.area, e.business_partner, e.locator, r.status, uploadLabel(e.batch_id), e.row_no,
        e.send_date, e.sender, e.receive_date ?? (e.receive_date_raw && e.receive_date_raw !== "-" ? e.receive_date_raw : null),
        e.receiver, e.faktur, e.send_receipt_doc_no, ROLE_LABEL[roles.get(e.id)!]]);
    }
  }
  return out;
}

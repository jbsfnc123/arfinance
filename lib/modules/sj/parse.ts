// Parser "Laporan Serah Terima Surat Jalan By Shipment Date (NEW)" (CSV, Fase 85; header sama dengan laporan lama). Bentuk diperiksa dari file contoh: 18 kolom, koma, quoting
// RFC 4180 (Description bisa multi-baris), UTF-8 (BOM opsional), tanggal "DD Mon YYYY" (bulan Inggris 3 huruf),
// "-" = kosong. Satu baris = satu kejadian kirim/terima dokumen; SJ No. bisa berulang (riwayat).

export const SJ_HEADERS = [
  "Area", "SJ No.", "Tanggal SJ", "Business Partner", "Locator", "Send Date", "Sender", "Receive Date", "Receiver",
  "Jumlah Hari", "Faktur", "Description", "No. Route", "Shipper 1", "No. Plat", "Driver", "Shipper 2", "Send Receipt Doc No",
] as const;
// Fase 85: Monitor dibangun dari laporan ini (bukan Aging) → Tanggal SJ wajib; Area, Business Partner, Locator, Send Date dipakai bila ada.
const REQUIRED = ["SJ No.", "Tanggal SJ", "Receive Date", "Receiver"] as const;

/** Nama kolom di database/payload untuk tiap header CSV. */
export const SJ_FIELD: Record<(typeof SJ_HEADERS)[number], string> = {
  "Area": "area", "SJ No.": "sj_no", "Tanggal SJ": "tanggal_sj_raw", "Business Partner": "business_partner", "Locator": "locator",
  "Send Date": "send_date_raw", "Sender": "sender_raw", "Receive Date": "receive_date_raw", "Receiver": "receiver_raw",
  "Jumlah Hari": "jumlah_hari_raw", "Faktur": "faktur", "Description": "description", "No. Route": "no_route",
  "Shipper 1": "shipper_1", "No. Plat": "no_plat", "Driver": "driver", "Shipper 2": "shipper_2",
  "Send Receipt Doc No": "send_receipt_doc_no",
};

/** Baris siap kirim (payload sj_upload_rows): nilai mentah semua kolom + tanggal/nama yang sudah diurai. */
export type SjUploadRow = Record<string, string | null> & {
  sj_no: string; tanggal_sj: string | null; send_date: string | null; receive_date: string | null;
  sender: string | null; receiver: string | null;
};
export type SjBadRow = { line: number; reason: string };
export type SjParseResult = {
  headers: string[]; extraHeaders: string[]; rows: SjUploadRow[]; lines: number[]; bad: SjBadRow[];
  stats: { records: number; uniqueSj: number; repeatedSj: number; withReceiver: number; dateIssues: number };
};

/** CSV RFC 4180: koma, kutip ganda (""), newline di dalam kutip, CRLF/LF, BOM. Mengembalikan baris + nomor baris awal. */
export function parseCsv(text: string): { cells: string[]; line: number }[] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const out: { cells: string[]; line: number }[] = [];
  let row: string[] = [], f = "", q = false, line = 1, start = 1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else { if (c === "\n") line++; f += c; }
      continue;
    }
    if (c === '"' && f === "") q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\r") { /* CRLF */ }
    else if (c === "\n") { row.push(f); out.push({ cells: row, line: start }); row = []; f = ""; line++; start = line; }
    else f += c;
  }
  if (q) throw new Error("Format CSV tidak valid: tanda kutip tidak ditutup.");
  if (f !== "" || row.length) { row.push(f); out.push({ cells: row, line: start }); }
  return out;
}

const MONTHS: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const blank = (v: string | undefined) => v === undefined || v.trim() === "" || v.trim() === "-";

/** "DD Mon YYYY" → "YYYY-MM-DD". Kosong/"-" → null. Format lain atau tanggal mustahil → "invalid" (tidak ditebak). */
export function parseSjDate(v: string | undefined): string | null | "invalid" {
  if (blank(v)) return null;
  const m = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/.exec(v!.trim());
  const mo = m ? MONTHS[m[2]] : undefined;
  if (!m || !mo) return "invalid";
  const d = +m[1], y = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return "invalid";
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseSjCsv(text: string): SjParseResult {
  const table = parseCsv(text).filter((r) => r.cells.some((c) => c.trim() !== ""));
  if (!table.length) throw new Error("File kosong.");
  const headers = table[0].cells.map((h) => h.trim());
  const missing = REQUIRED.filter((h) => !headers.includes(h));
  if (missing.length) throw new Error(`Bukan Laporan Serah Terima Surat Jalan: kolom ${missing.join(", ")} tidak ditemukan.`);
  const extraHeaders = headers.filter((h) => !(SJ_HEADERS as readonly string[]).includes(h));
  const idx = Object.fromEntries(SJ_HEADERS.map((h) => [h, headers.indexOf(h)])) as Record<(typeof SJ_HEADERS)[number], number>;

  const rows: SjUploadRow[] = [], lines: number[] = [], bad: SjBadRow[] = [];
  let dateIssues = 0;
  for (const { cells, line } of table.slice(1)) {
    if (cells.length !== headers.length) { bad.push({ line, reason: `Jumlah kolom ${cells.length}, seharusnya ${headers.length}` }); continue; }
    const get = (h: (typeof SJ_HEADERS)[number]) => (idx[h] >= 0 ? cells[idx[h]] ?? "" : "");
    const sjNo = get("SJ No.").trim();
    if (!sjNo || sjNo === "-") { bad.push({ line, reason: "No. SJ kosong" }); continue; }
    const raw: Record<string, string> = {};
    for (const h of SJ_HEADERS) raw[SJ_FIELD[h]] = get(h);
    const tSj = parseSjDate(get("Tanggal SJ")), tSend = parseSjDate(get("Send Date")), tRecv = parseSjDate(get("Receive Date"));
    if (tSj === "invalid" || tSj === null || tSend === "invalid" || tRecv === "invalid") dateIssues++;
    rows.push({
      ...raw, sj_no: sjNo,
      tanggal_sj: tSj === "invalid" ? null : tSj, send_date: tSend === "invalid" ? null : tSend,
      receive_date: tRecv === "invalid" ? null : tRecv,
      sender: blank(get("Sender")) ? null : get("Sender").trim(),
      receiver: blank(get("Receiver")) ? null : get("Receiver"),
    } as SjUploadRow);
    lines.push(line);
  }
  const counts = new Map<string, number>();
  for (const r of rows) { const k = r.sj_no.toUpperCase(); counts.set(k, (counts.get(k) ?? 0) + 1); }
  return {
    headers, extraHeaders, rows, lines, bad,
    stats: {
      records: rows.length + bad.length, uniqueSj: counts.size, repeatedSj: [...counts.values()].filter((n) => n > 1).length,
      withReceiver: rows.filter((r) => r.receiver).length, dateIssues,
    },
  };
}

/** Kandidat penerimaan dari satu file: per SJ, baris PERTAMA (urutan file) dengan Receiver diakui & Receive Date valid. */
export type SjCandidate = { sj_key: string; sj_no: string; receive_date: string; receiver: string; line: number };
export function receiptCandidates(parsed: Pick<SjParseResult, "rows" | "lines">, recognized: ReadonlySet<string>): SjCandidate[] {
  const out = new Map<string, SjCandidate>();
  parsed.rows.forEach((r, i) => {
    const key = r.sj_no.trim().toUpperCase();
    if (out.has(key) || !r.receiver || !r.receive_date) return;
    const name = r.receiver.trim().replace(/\s+/g, " ");
    if (!recognized.has(name.toLowerCase())) return;
    out.set(key, { sj_key: key, sj_no: r.sj_no, receive_date: r.receive_date, receiver: name, line: parsed.lines[i] });
  });
  return [...out.values()];
}

/** Dokumen yang dipantau Monitor Surat Jalan: hanya nomor berawalan "SJ/" (laporan juga memuat MR/… retur). */
export const isSjDoc = (key: string) => key.startsWith("SJ/");

/**
 * Satu dokumen per SJ dari laporan (Fase 85): field dari baris pertama SJ itu; field kosong diisi dari baris berikutnya;
 * Send Date = yang paling awal. Hanya SJ/… (lihat isSjDoc).
 */
export type SjDoc = { sj_key: string; sj_no: string; tanggal_sj: string | null; area: string | null; business_partner: string | null; locator: string | null; send_date: string | null };
export function docRows(parsed: Pick<SjParseResult, "rows">): SjDoc[] {
  const out = new Map<string, SjDoc>();
  const val = (v: string | null | undefined) => (v === undefined || v === null || blank(v) ? null : v.trim());
  for (const r of parsed.rows) {
    const key = r.sj_no.trim().toUpperCase();
    if (!isSjDoc(key)) continue;
    const next: SjDoc = { sj_key: key, sj_no: r.sj_no.trim(), tanggal_sj: r.tanggal_sj, area: val(r.area), business_partner: val(r.business_partner), locator: val(r.locator), send_date: r.send_date };
    const cur = out.get(key);
    if (!cur) { out.set(key, next); continue; }
    cur.tanggal_sj ??= next.tanggal_sj; cur.area ??= next.area; cur.business_partner ??= next.business_partner; cur.locator ??= next.locator;
    if (next.send_date && (!cur.send_date || next.send_date < cur.send_date)) cur.send_date = next.send_date;
  }
  return [...out.values()];
}

/** Hasil sj_report_apply (per potongan; dijumlahkan dengan sumReport). */
export type SjReportResult = { docs: number; docsNew: number; sent: number; saved: number; existing: number; notRecognized: number; badDate: number };
export const SJ_CHUNK = 5000; // per panggilan RPC: laporan 60 hari ±40 ribu SJ → satu panggilan besar bisa timeout (Fase 85b)

/** Pecah dokumen & penerimaan menjadi potongan kecil (masing-masing ≤ size) agar tiap RPC cepat; urutan dipertahankan. */
export function chunkReport<D, R>(docs: readonly D[], receipts: readonly R[], size = SJ_CHUNK): { docs: D[]; receipts: R[] }[] {
  const n = Math.max(1, Math.ceil(Math.max(docs.length, receipts.length) / size));
  return Array.from({ length: n }, (_, i) => ({ docs: docs.slice(i * size, (i + 1) * size), receipts: receipts.slice(i * size, (i + 1) * size) }));
}
export function sumReport(rs: readonly SjReportResult[]): SjReportResult {
  const z: SjReportResult = { docs: 0, docsNew: 0, sent: 0, saved: 0, existing: 0, notRecognized: 0, badDate: 0 };
  for (const r of rs) for (const k of Object.keys(z) as (keyof SjReportResult)[]) z[k] += Number(r[k] ?? 0);
  return z;
}

import { parseDate } from "@/lib/parsers/date";

// Modul Billing › Email Customer (Fase 60): daftar email Business Partner untuk pengiriman tagihan.
// Empat tab seperti file "Email Customer.xlsx": BP CBD, Group CBD, BP TOP, Group TOP. Tab Group: PIC & email milik
// Payment Group (berlaku untuk semua BP anggotanya). Payment Group / Collection / Marketing yang kosong diisi dari
// database (Aging terkini, cadangan invoice ERP) lewat key BP hasil pencocokan Value.

export type Term = "CBD" | "TOP";
export type Level = "BP" | "Group";
export type EmailGroup = { id: number; term: Term; payment_group: string; pic_ar: string | null; keterangan: string | null; email_note: string | null; updated_at: string };
export type EmailCustomer = {
  id: number; term: Term; level: Level; group_id: number | null; business_partner: string; bp_value: string | null; bp_key: string | null;
  payment_group: string | null; pic_ar: string | null; keterangan: string | null; email_note: string | null; updated_at: string;
};
export type EmailAddress = { customer_id: number | null; group_id: number | null; email: string };
export type BpLookup = { bp_key: string; payment_group: string | null; collection_name: string | null; marketing: string | null; sales_name: string | null; branch: string | null; bp_name: string | null; in_aging: boolean };
export type SalesMark = { bp_value: string; sale_date: string };
export type TopSale = { bp_key: string; invoice_date: string };
export type SentMark = { customer_id: number; week_start: string; updated_at: string; by_name: string };
export type SalesUpload = { at: string; kind: "cbd" | "erp"; file_name: string | null; rows: number | null; uploader: string };
export type EmailData = {
  groups: EmailGroup[]; customers: EmailCustomer[]; emails: EmailAddress[]; lookup: BpLookup[];
  // Fase 61: sumber kolom penjualan mingguan — CBD dari upload "CBD sales" (hanya tanda), TOP dari invoice ERP.
  cbdMarks?: SalesMark[]; topSales?: TopSale[]; uploads?: SalesUpload[];
  // Fase 62: minggu yang emailnya sudah dikirim (hijau).
  sent?: SentMark[];
};

export const TABS = [
  { key: "bp-cbd", label: "BP CBD", term: "CBD", level: "BP" },
  { key: "group-cbd", label: "Group CBD", term: "CBD", level: "Group" },
  { key: "bp-top", label: "BP TOP", term: "TOP", level: "BP" },
  { key: "group-top", label: "Group TOP", term: "TOP", level: "Group" },
] as const;
export type TabKey = (typeof TABS)[number]["key"];

// ── Minggu penjualan: dipotong setiap Sabtu (Okt 2026: 1–3, 4–10, 11–17, 18–24, 25–31) ──────────────
export type Week = { key: `w${number}`; start: string; end: string; label: string };
const MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export function monthWeeks(month: string): Week[] {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return [];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const iso = (d: number) => `${month}-${String(d).padStart(2, "0")}`;
  const out: Week[] = [];
  for (let d = 1; d <= last;) {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 6 = Sabtu
    const end = Math.min(last, d + ((6 - dow + 7) % 7));
    out.push({ key: `w${out.length + 1}`, start: iso(d), end: iso(end), label: `${d}${end > d ? `–${end}` : ""} ${MON[m - 1]}` });
    d = end + 1;
  }
  return out;
}

/** ✓ per minggu bila ada tanggal penjualan BP di rentang minggu itu. */
export function weeklySales(dates: ReadonlySet<string> | undefined, weeks: Week[]): boolean[] {
  if (!dates?.size) return weeks.map(() => false);
  const list = [...dates];
  return weeks.map((w) => list.some((d) => d >= w.start && d <= w.end));
}

// ── Pencocokan tanda penjualan ke BP ─────────────────────────────────────────────────────────────────
const normKey = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/\s+/g, " ").trim();
const leadNum = (s: string | null | undefined) => /^\d+/.exec((s ?? "").trim())?.[0] ?? "";

/**
 * Tanggal penjualan per id BP. TOP: invoice ERP dengan Key BP yang sama. CBD: Value di file (`Nama_Value`) sama persis
 * dengan Value/Key BP (tanpa beda huruf/spasi); selain itu angka depan bila hanya menunjuk satu Value BP CBD.
 */
export function salesDatesById(data: EmailData): Map<number, Set<string>> {
  const out = new Map<number, Set<string>>();
  const add = (id: number, d: string) => (out.get(id) ?? out.set(id, new Set()).get(id)!).add(d);
  const top = new Map<string, string[]>();
  for (const t of data.topSales ?? []) (top.get(t.bp_key) ?? top.set(t.bp_key, []).get(t.bp_key)!).push(t.invoice_date);
  const exact = new Map<string, number[]>(); const byNum = new Map<string, Map<string, number[]>>();
  for (const c of data.customers) {
    if (c.term === "TOP") { for (const d of (c.bp_key && top.get(c.bp_key)) || []) add(c.id, d); continue; }
    for (const k of new Set([normKey(c.bp_value), normKey(c.bp_key)].filter(Boolean))) (exact.get(k) ?? exact.set(k, []).get(k)!).push(c.id);
    const num = leadNum(c.bp_value) || leadNum(c.bp_key);
    if (!num) continue;
    const vals = byNum.get(num) ?? byNum.set(num, new Map()).get(num)!;
    const v = normKey(c.bp_value || c.bp_key);
    (vals.get(v) ?? vals.set(v, []).get(v)!).push(c.id);
  }
  for (const m of data.cbdMarks ?? []) {
    let ids = exact.get(normKey(m.bp_value));
    if (!ids) { const vals = byNum.get(leadNum(m.bp_value)); ids = vals && vals.size === 1 ? [...vals.values()][0] : []; }
    for (const id of new Set(ids)) add(id, m.sale_date);
  }
  return out;
}

// ── File "CBD sales" (ERP: Payment/Receipt) ──────────────────────────────────────────────────────────
export const CBD_TYPES = ["AR Receipt (Prepaid)", "AR Receipt (Prepaid-ESPAY)"];
export type CbdParse = { marks: SalesMark[]; from: string; to: string; receipts: number; reversed: number; bps: number; noValue: number };

/** Ambil penjualan CBD: Document Type Prepaid/Prepaid-ESPAY, bukan Reversed, tanggal = Transaction Date,
 *  Business Partner "Nama_Value" → Value. Hanya tanda unik (Value, tanggal) yang dikembalikan, tanpa nominal. */
export function parseCbdSales(sheets: { name: string; rows: unknown[][] }[]): CbdParse {
  const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  for (const sh of sheets) {
    const hi = sh.rows.slice(0, 15).findIndex((r) => r.some((c) => norm(c) === "document type") && r.some((c) => norm(c) === "transaction date"));
    if (hi < 0) continue;
    const h = sh.rows[hi].map(norm);
    const col = (name: string) => h.indexOf(name);
    const [cType, cDate, cBp, cStatus] = [col("document type"), col("transaction date"), col("business partner"), col("document status")];
    if (cBp < 0) throw new Error("Kolom Business Partner tidak ditemukan.");
    const types = new Set(CBD_TYPES.map(norm));
    const seen = new Map<string, SalesMark>(); const bps = new Set<string>();
    let from = "", to = "", receipts = 0, reversed = 0, noValue = 0;
    for (const r of sh.rows.slice(hi + 1)) {
      const date = parseDate(r[cDate]);
      if (!date) continue;
      if (!from || date < from) from = date;
      if (!to || date > to) to = date;
      if (!types.has(norm(r[cType]))) continue;
      if (cStatus >= 0 && norm(r[cStatus]) === "reversed") { reversed++; continue; }
      const bp = String(r[cBp] ?? "").trim(); const cut = bp.lastIndexOf("_");
      const value = cut >= 0 ? bp.slice(cut + 1).trim() : "";
      if (!value) { noValue++; continue; }
      receipts++; bps.add(value.toUpperCase());
      const k = `${value.toUpperCase()}|${date}`;
      if (!seen.has(k)) seen.set(k, { bp_value: value, sale_date: date });
    }
    if (!from) throw new Error("Tidak ada Transaction Date yang terbaca.");
    return { marks: [...seen.values()], from, to, receipts, reversed, bps: bps.size, noValue };
  }
  throw new Error("Bukan file CBD sales: kolom Document Type / Transaction Date tidak ditemukan.");
}

// ── Baris tabel ────────────────────────────────────────────────────────────────────────────────────
export type EmailRow = {
  id: number; group_id: number | null; term: Term; level: Level;
  payment_group: string; pg_from_db: boolean; business_partner: string; bp_value: string; bp_key: string;
  collection: string; marketing: string; sales: string; branch: string;
  pic_ar: string; emails: string; email_note: string; keterangan: string; match: "Cocok" | "Tidak cocok";
  sentInfo: Record<string, string>; // kunci minggu -> keterangan waktu & pengirim
  [week: `w${number}`]: string;
};

// Nilai sel minggu: ada penjualan & belum dikirim (kuning) / sudah dikirim (hijau) / tidak ada penjualan.
export const CELL = { pending: "✓ Pending", done: "✓ Terkirim", none: "✗" } as const;

/** KPI per tab & bulan: Total = sel ✓, Done = sudah dikirim, Pending = sisanya. */
export function weekKpi(rows: EmailRow[], weeks: Week[]) {
  let total = 0, done = 0;
  for (const r of rows) for (const w of weeks) {
    if (r[w.key] === CELL.done) { total++; done++; } else if (r[w.key] === CELL.pending) total++;
  }
  return { total, done, pending: total - done };
}

export function buildRows(data: EmailData, term: Term, level: Level, weeks: Week[], sales = salesDatesById(data)): EmailRow[] {
  const groups = new Map(data.groups.map((g) => [g.id, g]));
  const look = new Map(data.lookup.map((l) => [l.bp_key, l]));
  const byCustomer = new Map<number, string[]>(); const byGroup = new Map<number, string[]>();
  for (const e of data.emails) {
    if (e.customer_id != null) (byCustomer.get(e.customer_id) ?? byCustomer.set(e.customer_id, []).get(e.customer_id)!).push(e.email);
    else if (e.group_id != null) (byGroup.get(e.group_id) ?? byGroup.set(e.group_id, []).get(e.group_id)!).push(e.email);
  }
  const sent = new Map((data.sent ?? []).map((m) => [`${m.customer_id}|${m.week_start}`, m]));
  const join = (...xs: (string | null | undefined)[]) => xs.filter((x) => x && x.trim()).join(" · ");
  return data.customers.filter((c) => c.term === term && c.level === level).map((c) => {
    const g = c.group_id != null ? groups.get(c.group_id) : undefined;
    const l = c.bp_key ? look.get(c.bp_key) : undefined;
    const manualPg = (g?.payment_group ?? c.payment_group ?? "").trim();
    const weekly = weeklySales(sales.get(c.id), weeks);
    const row: EmailRow = {
      id: c.id, group_id: c.group_id, term: c.term, level: c.level,
      payment_group: manualPg || l?.payment_group || "", pg_from_db: !manualPg && !!l?.payment_group,
      business_partner: c.business_partner, bp_value: c.bp_value ?? "", bp_key: c.bp_key ?? "",
      collection: l?.collection_name ?? "", marketing: l?.marketing ?? "", sales: l?.sales_name ?? "", branch: l?.branch ?? "",
      pic_ar: (g ? g.pic_ar : c.pic_ar) ?? "",
      emails: [...(g ? byGroup.get(g.id) ?? [] : []), ...(byCustomer.get(c.id) ?? [])].join(", "),
      email_note: join(g?.email_note, c.email_note), keterangan: join(g?.keterangan, c.keterangan),
      match: c.bp_key ? "Cocok" : "Tidak cocok", sentInfo: {},
    };
    weeks.forEach((w, i) => {
      const m = sent.get(`${c.id}|${w.start}`);
      row[w.key] = !weekly[i] ? CELL.none : m ? CELL.done : CELL.pending;
      if (m && weekly[i]) row.sentInfo[w.key] = `Dikirim ${m.updated_at.slice(0, 16).replace("T", " ")} oleh ${m.by_name}`;
    });
    return row;
  });
}

/** Pecah teks isian email: alamat valid (huruf kecil, unik) + sisa teks sebagai catatan. */
const EMAIL = /[^\s@,;<>()"']+@[^\s@,;<>()"']+\.[^\s@,;<>()"'.]+/g;
export function splitEmails(text: string): { emails: string[]; rest: string } {
  const emails = [...new Set((text.match(EMAIL) ?? []).map((e) => e.toLowerCase()))];
  const rest = text.replace(EMAIL, " ").replace(/[,;/]+/g, " ").replace(/\s+/g, " ").trim();
  return { emails, rest };
}

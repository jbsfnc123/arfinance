import { parseDate } from "@/lib/parsers/date";
import { parseNumber } from "@/lib/parsers/number";

// Parser laporan ERP BERSAMA (Fase 7). Setiap laporan di-upload sekali lalu dipakai semua menu:
//   aging    (Blank_A4 = MASTER AGING)          → Collection, Mitra10, Tukar Faktur, Presentasi
//   erp      (Invoice and Payment Date Comparison) → Mutasi Bank, Presentasi, Marketplace
//   bpmaster (Business Partner)                 → Presentasi
// Kolom dicari berdasarkan nama header (tidak peka huruf besar/kecil & tanda baca).

export type Sheet = { name: string; rows: unknown[][] };
export type SharedKind = "aging" | "erp" | "bpmaster";
export type FileKind = SharedKind | "target" | "mutasi";

export const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
// Excel error (#N/A) & teks "null" → kosong.
const clean = (v: unknown) => {
  const s = text(v);
  return /^#(n\/a|value!|ref!|div\/0!|name\?|num!|null!)$/i.test(s) || s.toLowerCase() === "null" ? "" : v;
};
const str = (v: unknown) => text(clean(v)) || null;
const num = (v: unknown) => parseNumber(clean(v));
const numOrNull = (v: unknown) => (text(clean(v)) === "" ? null : parseNumber(clean(v)));
const date = (v: unknown) => parseDate(clean(v));
const int = (v: unknown) => { const n = numOrNull(v); return n === null ? null : Math.round(n); };

type Spec<T> = Record<keyof T, { h: string[]; f: (v: unknown) => unknown }>;

// Baris header pertama (maks. 25 baris) yang memuat semua header wajib.
function headerRow(rows: unknown[][], required: string[]) {
  const want = required.map(norm);
  for (let r = 0; r < Math.min(25, rows.length); r++) {
    const cells = (rows[r] ?? []).map(norm);
    if (want.every((w) => cells.includes(w))) {
      const idx = new Map<string, number>();
      cells.forEach((c, i) => { if (c && !idx.has(c)) idx.set(c, i); });
      return { row: r, idx };
    }
  }
  return null;
}

function mapRows<T>(rows: unknown[][], h: { row: number; idx: Map<string, number> }, spec: Spec<T>) {
  const cols = Object.fromEntries(Object.entries(spec).map(([k, s]) => {
    const i = (s as { h: string[] }).h.map(norm).map((x) => h.idx.get(x)).find((x) => x !== undefined);
    return [k, i ?? -1];
  })) as Record<keyof T, number>;
  const out: T[] = [];
  for (const r of rows.slice(h.row + 1)) {
    if (!r || r.every((c) => text(c) === "")) continue;
    const o = {} as Record<keyof T, unknown>;
    for (const k of Object.keys(spec) as (keyof T)[]) o[k] = cols[k] >= 0 ? spec[k].f(r[cols[k]]) : spec[k].f("");
    out.push(o as T);
  }
  return { rows: out, cols };
}

// ── Deteksi jenis file ────────────────────────────────────────────
export function detectKind(sheets: Sheet[]): FileKind | null {
  if (sheets.some((s) => headerRow(s.rows, ["Tanggal Transaksi", "Jumlah"]))) return "mutasi";
  const first = sheets[0]?.rows ?? [];
  if (headerRow(first, ["Search Key", "Name"])) return "bpmaster";
  if (headerRow(first, ["Open Amt", "Invoice No", "Due Date"]) && (headerRow(first, ["Open Amt", "Tax Name"]) || headerRow(first, ["Open Amt", "Collection Name"]))) return "aging";
  if (headerRow(first, ["Invoice No", "Open Amt"]) || headerRow(first, ["Invoice No", "Target"])) return "target";
  if (sheets.some((s) => headerRow(s.rows, ["Invoice No", "Invoice Date"]) || headerRow(s.rows, ["Invoice No", "Payment Date"]))) return "erp";
  return null;
}

// ── Aging ─────────────────────────────────────────────────────────
export type AgingRow = {
  payment_group: string | null; limit_group: string | null; marketing: string | null; collection_name: string | null;
  sales_name: string | null; bp_key: string | null; business_partner: string | null; tax_name: string | null;
  invoice_no: string | null; invoice_date: string | null; due_date: string | null; open_amt: number;
  cur_0_30: number; cur_31_60: number; due_1_7: number; due_8_30: number; due_31_60: number; due_61_90: number;
  due_90: number; days: number | null; branch: string | null; follow_up: string | null; no_po: string | null;
  no_sj: string | null; area: string | null;
};

const AGING: Spec<AgingRow> = {
  payment_group: { h: ["Payment Group"], f: str }, limit_group: { h: ["Limit Group"], f: str },
  marketing: { h: ["Marketing"], f: str }, collection_name: { h: ["Collection Name"], f: str },
  sales_name: { h: ["Sales Name"], f: str }, bp_key: { h: ["Value"], f: str },
  business_partner: { h: ["Business Partner"], f: str }, tax_name: { h: ["Tax Name"], f: str },
  invoice_no: { h: ["Invoice No"], f: str }, invoice_date: { h: ["Invoice Date"], f: date },
  due_date: { h: ["Due Date"], f: date }, open_amt: { h: ["Open Amt"], f: num },
  cur_0_30: { h: ["Current 0 - 30"], f: num }, cur_31_60: { h: ["Current 31 - 60"], f: num },
  due_1_7: { h: ["Due + 1 - 7"], f: num }, due_8_30: { h: ["Due + 8 - 30"], f: num },
  due_31_60: { h: ["Due + 31 - 60"], f: num }, due_61_90: { h: ["Due + 61 - 90"], f: num },
  due_90: { h: ["Due + > 90"], f: num }, days: { h: ["Days"], f: int }, branch: { h: ["Branch"], f: str },
  follow_up: { h: ["Follow Up"], f: str }, no_po: { h: ["No PO"], f: str }, no_sj: { h: ["No SJ"], f: str },
  area: { h: ["Area"], f: str },
};

// Semua baris disimpan apa adanya (tanpa filter) — filter tiap menu ada di view database.
export function parseAging(sheets: Sheet[], preferSheet = "Blank_A4") {
  const sheet = sheets.find((s) => s.name.toLowerCase() === preferSheet.toLowerCase()) ?? sheets[0];
  const h = sheet && headerRow(sheet.rows, ["Open Amt", "Invoice No", "Due Date"]);
  if (!h) throw new Error("Header 'Invoice No' / 'Due Date' / 'Open Amt' tidak ditemukan di file aging.");
  const { rows } = mapRows(sheet.rows, h, AGING);
  const data = rows.filter((r) => r.invoice_no || r.open_amt || r.due_date);
  const maxDate = data.reduce<string | null>((m, r) => (r.invoice_date && (!m || r.invoice_date > m) ? r.invoice_date : m), null);
  if (!maxDate) throw new Error("Kolom Invoice Date tidak berisi tanggal yang bisa dibaca.");
  return { rows: data, sheet: sheet.name, month: maxDate.slice(0, 7), total: data.reduce((a, r) => a + r.open_amt, 0) };
}

// ── Laporan Invoice & Payment Date Comparison ───────────────────
export type ErpRow = {
  invoice_no: string | null; bp_key: string | null; bp_name: string | null; bp_location: string | null;
  bp_group: string | null; marketing_group: string | null; branch: string | null; payment_term: string | null;
  credit_limit: number | null; invoice_date: string | null; due_date: string | null; amount: number | null;
  po_customer: string | null; payment_doc: string | null; payment_bank: string | null; payment_date: string | null;
  payment_amount: number | null;
};
export type ErpMeta = { kind: "invoice" | "payment"; org?: string; paymentGroup?: string; dari?: string; ke?: string };

const ERP: Spec<ErpRow> = {
  invoice_no: { h: ["Invoice No."], f: str }, bp_key: { h: ["BP Key"], f: str }, bp_name: { h: ["BP Name"], f: str },
  bp_location: { h: ["BP Location"], f: str }, bp_group: { h: ["BP Group"], f: (v) => str(v)?.replace(/\s*-\s*$/, "") ?? null },
  marketing_group: { h: ["Marketing Group"], f: str }, branch: { h: ["Branch"], f: str },
  payment_term: { h: ["Payment Term"], f: str }, credit_limit: { h: ["Credit Limit"], f: numOrNull },
  invoice_date: { h: ["Invoice Date"], f: date }, due_date: { h: ["Due Date"], f: date },
  amount: { h: ["Invoice Amount"], f: numOrNull }, po_customer: { h: ["PO No. Customer"], f: str },
  payment_doc: { h: ["Payment Document"], f: str }, payment_bank: { h: ["Payment Bank Account"], f: str },
  payment_date: { h: ["Payment Date"], f: date }, payment_amount: { h: ["Payment Amount"], f: numOrNull },
};

// Periode & filter laporan dari baris di atas header ("Organization :", "Payment Group", "Date : a / b").
function erpMetaOf(rows: unknown[][], headerIdx: number) {
  const meta: Omit<ErpMeta, "kind"> = {};
  for (const r of rows.slice(0, headerIdx)) {
    const label = text(r?.[0]).replace(/[\t:]/g, "").trim().toLowerCase();
    const vals = (r ?? []).slice(1).filter((v) => text(v) !== "" && text(v) !== "/" && text(v) !== ":");
    if (label === "organization") meta.org = text(vals[0]);
    else if (label === "payment group") meta.paymentGroup = text(vals[0]);
    else if (label === "date") {
      const d = vals.map((v) => date(v)).filter(Boolean) as string[];
      if (d.length >= 2) { meta.dari = d[0]; meta.ke = d[1]; }
    }
  }
  return meta;
}

// Laporan yang sama dipakai dua cara (port invoiceOrPayment_ Presentasi): difilter per tanggal
// INVOICE (file Invoice) atau per tanggal PAYMENT (file Payment). File tanpa kolom Invoice Date = Payment.
function erpKind(rows: ErpRow[], meta: Omit<ErpMeta, "kind">, cols: Record<keyof ErpRow, number>): "invoice" | "payment" {
  if (cols.invoice_date < 0) return "payment";
  if (!meta.dari || !meta.ke || cols.payment_date < 0) return "invoice";
  const within = (d: string | null) => !!d && d >= meta.dari! && d <= meta.ke!;
  const n = rows.length;
  const inInv = rows.filter((r) => within(r.invoice_date)).length;
  const inPay = rows.filter((r) => within(r.payment_date)).length;
  return n && inPay / n > 0.98 && inInv / n < 0.98 ? "payment" : "invoice";
}

export function parseErp(sheets: Sheet[]) {
  for (const s of sheets) {
    const h = headerRow(s.rows, ["Invoice No."]) ?? headerRow(s.rows, ["Invoice No"]);
    if (!h || (!h.idx.has("invoicedate") && !h.idx.has("paymentdate"))) continue;
    const { rows, cols } = mapRows(s.rows, h, ERP);
    if (cols.invoice_no < 0) cols.invoice_no = h.idx.get("invoiceno") ?? -1;
    const data = (cols.invoice_no >= 0 ? rows : []).filter((r) => r.invoice_no);
    const base = erpMetaOf(s.rows, h.row);
    const meta: ErpMeta = { ...base, kind: erpKind(data, base, cols) };
    const months = [...new Set(data.map((r) => (meta.kind === "invoice" ? r.invoice_date : r.payment_date)?.slice(0, 7)).filter(Boolean))].sort() as string[];
    return { rows: data, meta, months, invoices: new Set(data.map((r) => r.invoice_no)).size };
  }
  throw new Error("Header 'Invoice No.' dengan 'Invoice Date' / 'Payment Date' tidak ditemukan.");
}

// ── Master Business Partner ──────────────────────────────────────
export type BpRow = {
  search_key: string | null; name: string | null; payment_group: string | null; pic_ar: string | null;
  sales_agent: string | null; payment_term: string | null; marketing_group: string | null; customer_type: string | null;
  credit_limit: number | null; credit_status: string | null; sales_region: string | null; branch: string | null;
  description: string | null; first_sale: string | null; last_sale: string | null; customer: string | null;
};
const BP: Spec<BpRow> = {
  search_key: { h: ["Search Key"], f: str }, name: { h: ["Name"], f: str }, payment_group: { h: ["Payment Group"], f: str },
  pic_ar: { h: ["PIC AR"], f: str }, sales_agent: { h: ["Sales / Agent"], f: str }, payment_term: { h: ["Payment Term"], f: str },
  marketing_group: { h: ["Marketing Groups"], f: str }, customer_type: { h: ["TypeOfCustomer"], f: str },
  credit_limit: { h: ["Credit Limit"], f: numOrNull }, credit_status: { h: ["Credit Status"], f: str },
  sales_region: { h: ["Sales Region"], f: str }, branch: { h: ["Branch"], f: str }, description: { h: ["Description"], f: str },
  first_sale: { h: ["First Sale"], f: date }, last_sale: { h: ["LastSale"], f: date }, customer: { h: ["Customer"], f: str },
};

export function parseBpMaster(sheets: Sheet[]) {
  const s = sheets[0];
  const h = s && headerRow(s.rows, ["Search Key", "Name"]);
  if (!h) throw new Error("Header 'Search Key' / 'Name' tidak ditemukan di file Business Partner.");
  return { rows: mapRows(s.rows, h, BP).rows.filter((r) => r.search_key) };
}

// Menu yang ikut terisi dari tiap jenis laporan (ditampilkan di pratinjau Pusat Upload).
export const KIND_INFO: Record<FileKind, { label: string; feeds: string }> = {
  aging: { label: "Aging (Blank_A4 / MASTER AGING)", feeds: "Collection, Dashboard Controller, Tukar Faktur, Mitra10, Presentasi" },
  erp: { label: "Invoice & Payment Date Comparison", feeds: "Mutasi Bank vs Realisasi, Presentasi, Marketplace (ERP)" },
  bpmaster: { label: "Master Business Partner", feeds: "Presentasi" },
  target: { label: "Target bulanan", feeds: "Dashboard Controller, Mutasi Bank vs Realisasi" },
  mutasi: { label: "Mutasi rekening bank", feeds: "Mutasi Bank vs Realisasi" },
};

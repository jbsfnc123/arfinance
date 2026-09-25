import { excelSerialToISO } from "@/lib/parsers/date";
import { parseNumber } from "@/lib/parsers/number";
import { fmtDate } from "@/lib/format";

// Port Cek Selisih Harga/Index.html: upload SO (tab "Sheet0"), upload PO Mitra10/RKM,
// rekonsiliasi Total PO vs Total SO per No PO Customer.

// ── Upload SO ────────────────────────────────────────────────────
export type SoRow = {
  document_no: string;
  date_po: string;        // dd/MM/yyyy
  no_po_customer: string;
  business_partner: string;
  price_list: string;
  document_status: string;
  grand_total: number;
};

const SO_COLUMNS: { key: keyof SoRow; name: string; aliases: string[] }[] = [
  { key: "document_no", name: "Document No", aliases: [] },
  { key: "date_po", name: "Date PO", aliases: [] },
  { key: "no_po_customer", name: "No PO Customer", aliases: ["no po", "nopo"] },
  { key: "business_partner", name: "Business Partner", aliases: [] },
  { key: "price_list", name: "Price List", aliases: [] },
  { key: "document_status", name: "Document Status", aliases: [] },
  { key: "grand_total", name: "Grand Total", aliases: [] },
];

// "no_po" → "no po", "Business Partner " → "business partner"
export const normalizeHeader = (h: unknown) => String(h ?? "").replace(/[_\s]+/g, " ").trim().toLowerCase();

function formatDatePO(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return fmtDate(excelSerialToISO(Math.floor(v + 1e-6)));
  const s = String(v).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : s;
}

export function parseSo(sheetRows: unknown[][], opts: { partnerPrefixes: string; status: string }) {
  const header = (sheetRows[0] ?? []).map(normalizeHeader);
  const idx = {} as Record<keyof SoRow, number>;
  const missing: string[] = [];
  for (const col of SO_COLUMNS) {
    // Nama kanonik dulu, baru alias — supaya template lama tetap cocok ke kolom yang sama persis.
    const i = [col.name, ...col.aliases].map(normalizeHeader).map((c) => header.indexOf(c)).find((x) => x >= 0);
    if (i === undefined) missing.push(col.aliases.length ? `${col.name} (atau: ${col.aliases.join(", ")})` : col.name);
    else idx[col.key] = i;
  }
  if (missing.length) throw new Error(`Kolom berikut tidak ditemukan di baris pertama: ${missing.join(", ")}`);

  const prefixes = opts.partnerPrefixes.toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  const status = opts.status.trim().toLowerCase();
  const rows: SoRow[] = [];

  for (const r of sheetRows.slice(1)) {
    if (!r || r.every((v) => v === null || v === undefined || String(v).trim() === "")) continue;
    const partner = String(r[idx.business_partner] ?? "").toLowerCase();
    const st = String(r[idx.document_status] ?? "").toLowerCase();
    if (prefixes.length && !prefixes.some((p) => partner.startsWith(p))) continue;
    if (status && st !== status) continue;
    const text = (k: keyof SoRow) => String(r[idx[k]] ?? "").trim();
    rows.push({
      document_no: text("document_no"),
      date_po: formatDatePO(r[idx.date_po]),
      no_po_customer: text("no_po_customer"),
      business_partner: text("business_partner"),
      price_list: text("price_list"),
      document_status: text("document_status"),
      grand_total: parseNumber(r[idx.grand_total]),
    });
  }
  return rows;
}

// ── Upload PO ────────────────────────────────────────────────────
export const PO_CATEGORIES = {
  MITRA10: {
    label: "Mitra10", accept: ".csv", exts: ["csv"], kind: "csv" as const, poCol: 0, totalCol: 20,
    hint: "Format CSV Mitra10. No PO di kolom A, Total IDR di kolom U. Boleh pilih lebih dari 1 file.",
  },
  RKM: {
    label: "RKM", accept: ".xlsx,.xls", exts: ["xlsx", "xls"], kind: "xlsx" as const, poCol: 0, totalCol: 4,
    hint: "Format Excel RKM. No PO (Docnum) di kolom A, Total di kolom E. Boleh pilih lebih dari 1 file.",
  },
};
export type PoCategory = keyof typeof PO_CATEGORIES;

// Parser CSV single-pass: field ber-quote, "" sebagai escape, CRLF/LF; pemisah ';' bila lebih banyak dari ','.
export function parseCsv(text: string): string[][] {
  const sample = text.slice(0, 4000);
  const delimiter = (sample.match(/;/g)?.length ?? 0) > (sample.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// Total per No PO (huruf besar) dari beberapa file; baris header pertama dilewati.
export function aggregatePo(files: unknown[][][], category: PoCategory) {
  const cfg = PO_CATEGORIES[category];
  const pivot = new Map<string, number>();
  for (const rows of files) {
    for (const r of rows.slice(1)) {
      const po = String(r?.[cfg.poCol] ?? "").trim().toUpperCase();
      if (!po) continue;
      pivot.set(po, (pivot.get(po) ?? 0) + Math.round(parseNumber(r[cfg.totalCol])));
    }
  }
  return pivot;
}

// ── Rekonsiliasi ─────────────────────────────────────────────────
export type SoPivot = {
  po: string; total: number; document_no: string; date_po: string; business_partner: string;
  price_list: string; document_status: string; is_manual: boolean;
};

export type ReconStatus = "SELISIH" | "OK" | "NOT_FOUND";

export type ReconRow = {
  status: ReconStatus;
  hasSO: boolean;
  document_no: string; date_po: string; po_customer: string; business_partner: string;
  price_list: string; document_status: string;
  total_po: number; total_so: number; selisih: number; is_manual: boolean;
};

export const RECON_STATUS_TEXT: Record<ReconStatus, string> = {
  SELISIH: "Selisih", OK: "OK", NOT_FOUND: "SO tidak ditemukan",
};

// Semua PO dari file ditampilkan: Selisih (|selisih| > 1) dulu, lalu SO tidak ditemukan, lalu OK.
export function reconcile(poPivot: Map<string, number>, soPivot: SoPivot[]): ReconRow[] {
  const so = new Map(soPivot.map((s) => [s.po, s]));
  const rows: ReconRow[] = [...poPivot.entries()].map(([po, totalPo]) => {
    const s = so.get(po);
    if (!s) {
      return {
        status: "NOT_FOUND", hasSO: false, document_no: "-", date_po: "-", po_customer: po,
        business_partner: "-", price_list: "-", document_status: "-",
        total_po: totalPo, total_so: 0, selisih: 0, is_manual: false,
      };
    }
    const totalSo = Number(s.total) || 0;
    const selisih = totalPo - totalSo;
    return {
      status: Math.abs(selisih) > 1 ? "SELISIH" : "OK", hasSO: true,
      document_no: s.document_no ?? "", date_po: s.date_po ?? "", po_customer: po,
      business_partner: s.business_partner ?? "", price_list: s.price_list ?? "", document_status: s.document_status ?? "",
      total_po: totalPo, total_so: totalSo, selisih, is_manual: !!s.is_manual,
    };
  });
  const order: Record<ReconStatus, number> = { SELISIH: 0, NOT_FOUND: 1, OK: 2 };
  return rows.sort((a, b) => order[a.status] - order[b.status]);
}

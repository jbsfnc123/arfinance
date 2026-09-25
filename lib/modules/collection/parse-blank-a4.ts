import { parseDate } from "@/lib/parsers/date";
import { parseNumber } from "@/lib/parsers/number";

// Port processExcelUpload (Aplikasi Utama/Script.html). Input: baris sheet pertama
// file Blank_A4 (header di baris 0). Kolom berdasarkan posisi, sama seperti versi lama.

export const MARKETING_WHITELIST = [
  "01-Traditional",
  "02-Modern Market",
  "03-Reseller",
  "16-Modern Market National",
  "04-Proyek",
];

// Invoice date harus SETELAH tanggal ini.
export const INVOICE_DATE_CUTOFF = "2026-01-01";

const COL = {
  paymentGroup: 0,   // A
  marketing: 2,      // C
  collection: 3,     // D
  value: 6,          // G
  bp: 7,             // H
  invoiceNo: 10,     // K
  invoiceDate: 11,   // L
  dueDate: 12,       // M
  openAmt: 13,       // N
  noPo: 25,          // Z
  noSj: 26,          // AA
} as const;

export type ArInvoiceRow = {
  invoice_no: string;
  payment_group: string;
  marketing: string;
  collection_name: string;
  business_partner: string;
  bp_value: string;
  invoice_date: string | null;
  due_date: string | null;
  open_amt: number;
  no_po: string;
  no_sj: string;
};

export type BlankA4Result = {
  rows: ArInvoiceRow[];
  skipped: { date: number; marketing: number; duplicate: number };
};

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

export function parseBlankA4(sheetRows: unknown[][]): BlankA4Result {
  const rows: ArInvoiceRow[] = [];
  const skipped = { date: 0, marketing: 0, duplicate: 0 };
  // Seperti versi lama: invoice dianggap "sudah ada" hanya setelah lolos semua filter.
  const seen = new Set<string>();

  for (const r of sheetRows.slice(1)) {
    const inv = text(r[COL.invoiceNo]);
    if (!inv) continue;
    if (seen.has(inv)) {
      skipped.duplicate++;
      continue;
    }

    const marketing = text(r[COL.marketing]);
    if (!MARKETING_WHITELIST.includes(marketing)) {
      skipped.marketing++;
      continue;
    }

    const invoiceDate = parseDate(r[COL.invoiceDate]);
    if (!invoiceDate || invoiceDate <= INVOICE_DATE_CUTOFF) {
      skipped.date++;
      continue;
    }

    seen.add(inv);
    rows.push({
      invoice_no: inv,
      payment_group: text(r[COL.paymentGroup]),
      marketing,
      collection_name: text(r[COL.collection]),
      business_partner: text(r[COL.bp]),
      bp_value: text(r[COL.value]),
      invoice_date: invoiceDate,
      due_date: parseDate(r[COL.dueDate]),
      open_amt: text(r[COL.openAmt]) === "" ? 0 : parseNumber(r[COL.openAmt]),
      no_po: text(r[COL.noPo]),
      no_sj: text(r[COL.noSj]),
    });
  }

  return { rows, skipped };
}

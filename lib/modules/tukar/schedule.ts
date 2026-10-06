import { parseDate } from "@/lib/parsers/date";
import { parseNumber } from "@/lib/parsers/number";

// Port Admin.html (Tukar Faktur): gabungkan "Data 1 Master Kirim" (CSV) dengan
// "Data 2 Aging" (opsional — bila tidak ada, server mengambil dari data tagihan).

export type ScheduleRow = {
  invoice_no: string;
  business_partner: string;
  invoice_date: string | null;
  send_date: string | null;
  payment_group?: string;
  marketing?: string;
  open_amt?: number;
};

const clean = (s: string | undefined) => (s ?? "").trim();

// Read quoted CSV records before accessing fixed report columns. Delimiters and
// newlines inside quoted fields are data; doubled quotes represent one quote.
function readMasterRecords(text: string, delimiter: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let cells: string[] = [], field = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) { cells.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      cells.push(field); records.push(cells); cells = []; field = "";
    } else field += c;
  }
  if (quoted) throw new Error("Format CSV tidak valid: tanda kutip tidak ditutup.");
  if (field !== "" || cells.length) { cells.push(field); records.push(cells); }
  return records;
}

// Report Send Invoice to Customer: B = Send Date, H = Business Partner,
// O = No. Invoice, P = Date Invoice. Header/report blocks can repeat.
export function parseMasterCsv(text: string) {
  const candidates = [",", ";", "\t"].map((delimiter) => {
    try {
      const records = readMasterRecords(text, delimiter);
      const headers = records.filter((r) => clean(r[14]).toLowerCase() === "no. invoice"
        && clean(r[15]).toLowerCase() === "date invoice").length;
      return { delimiter, records, score: headers * (records.length + 1) + records.filter((r) => r.length >= 16).length };
    } catch { return { delimiter, records: [] as string[][], score: -1 }; }
  }).sort((a, b) => b.score - a.score);
  const { delimiter, records, score } = candidates[0];
  if (score <= 0) throw new Error("Format CSV tidak dikenali. Gunakan laporan Master Kirim dengan delimiter koma, titik koma, atau tab dan minimal 16 kolom.");
  const rows: ScheduleRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const cols of records.slice(5)) {
    if (cols.every((c) => !c.trim())) continue;
    const dateInv = clean(cols[15]);
    const inv = clean(cols[14]);
    const invoiceDate = /^\d{1,2}([/-])\d{1,2}\1\d{4}$/.test(dateInv) ? parseDate(dateInv) : null;
    if (cols.length < 16 || !invoiceDate || !inv) {
      skipped++;
      continue;
    }
    if (seen.has(inv)) continue; // invoice pertama menang
    seen.add(inv);
    rows.push({
      invoice_no: inv,
      business_partner: clean(cols[7]),
      invoice_date: invoiceDate,
      send_date: parseDate(clean(cols[1])),
    });
  }
  return { rows, skipped, delimiter };
}

type AgingInfo = { payment_group: string; marketing: string; open_amt: number };

// File aging (Blank_A4): kolom dicari dari nama header baris pertama.
export function parseAgingLookup(sheetRows: unknown[][]) {
  const header = (sheetRows[0] ?? []).map((h) => String(h ?? "").trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const iInv = idx("invoice no") !== -1 ? idx("invoice no") : 10;
  const iPg = idx("payment group");
  const iMkt = idx("marketing");
  const iAmt = idx("open amt");

  const map = new Map<string, AgingInfo>();
  for (const r of sheetRows.slice(1)) {
    const inv = String(r?.[iInv] ?? "").trim();
    if (!inv) continue;
    map.set(inv, {
      payment_group: iPg >= 0 ? String(r[iPg] ?? "").trim() : "",
      marketing: iMkt >= 0 ? String(r[iMkt] ?? "").trim() : "",
      open_amt: iAmt >= 0 ? parseNumber(r[iAmt]) : 0,
    });
  }
  return map;
}

export function mergeSchedule(master: ScheduleRow[], aging: Map<string, AgingInfo> | null): ScheduleRow[] {
  if (!aging) return master;
  return master.map((m) => {
    const a = aging.get(m.invoice_no);
    return a ? { ...m, payment_group: a.payment_group, marketing: a.marketing, open_amt: a.open_amt } : m;
  });
}

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

const clean = (s: string | undefined) => (s ?? "").replace(/"/g, "").trim();

// CSV master: data mulai baris ke-6; pemisah ';' bila baris ke-5 memakai ';', selain itu ','.
// Kolom B = Send Date, H = Business Partner, O = No Invoice, P = Date Invoice (wajib dd/MM/yyyy).
export function parseMasterCsv(text: string) {
  const lines = text.split(/\r?\n/);
  const delimiter = lines.length > 4 && lines[4].includes(";") ? ";" : ",";
  const rows: ScheduleRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (let i = 5; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = lines[i].split(delimiter);
    if (cols.length < 16) {
      skipped++;
      continue;
    }
    const dateInv = clean(cols[15]);
    const inv = clean(cols[14]);
    if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateInv) || !inv) {
      skipped++;
      continue;
    }
    if (seen.has(inv)) continue; // invoice pertama menang
    seen.add(inv);
    rows.push({
      invoice_no: inv,
      business_partner: clean(cols[7]),
      invoice_date: parseDate(dateInv),
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

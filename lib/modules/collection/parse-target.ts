import { parseDate } from "@/lib/parsers/date";
import { parseNumber } from "@/lib/parsers/number";

// File target bulanan (dulu di-paste ke sheet "Tagihan"). Kolom dicari berdasarkan
// nama header di 15 baris pertama. Bila header tidak ditemukan, dipakai tata letak
// sheet Tagihan lama: A=Target, C=Marketing, D=Collection, E=BP, F=Invoice, H=Due, J=Branch.

export type TargetRow = {
  invoice_no: string;
  target: number;
  marketing: string;
  collection_name: string;
  business_partner: string;
  due_date: string | null;
  branch: string;
};

type Field = keyof TargetRow;

const ALIASES: Record<Field, string[]> = {
  invoice_no: ["invoiceno", "noinvoice", "invoice", "nomorinvoice", "invno"],
  target: ["target", "targetamt", "nominaltarget", "openamt", "nominal", "amount"],
  marketing: ["marketing", "marketinggroup"],
  collection_name: ["collectionname", "collection"],
  business_partner: ["businesspartner", "bpname", "bp", "customer"],
  due_date: ["duedate", "jatuhtempo", "tgljatuhtempo", "tanggaljatuhtempo"],
  branch: ["branch", "cabang"],
};

const LEGACY_LAYOUT: Record<Field, number> = {
  target: 0, marketing: 2, collection_name: 3, business_partner: 4,
  invoice_no: 5, due_date: 7, branch: 9,
};

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

export function detectTargetColumns(sheetRows: unknown[][]) {
  for (let i = 0; i < Math.min(15, sheetRows.length); i++) {
    const headers = (sheetRows[i] ?? []).map(norm);
    const cols = {} as Partial<Record<Field, number>>;
    for (const field of Object.keys(ALIASES) as Field[]) {
      // Alias diperiksa berurutan supaya "Target" menang atas "Open Amt" bila keduanya ada.
      for (const alias of ALIASES[field]) {
        const idx = headers.indexOf(alias);
        if (idx >= 0) {
          cols[field] = idx;
          break;
        }
      }
    }
    if (cols.invoice_no !== undefined && cols.target !== undefined) {
      return { headerRow: i, cols, legacy: false };
    }
  }
  return { headerRow: 0, cols: LEGACY_LAYOUT as Partial<Record<Field, number>>, legacy: true };
}

export function parseTarget(sheetRows: unknown[][]) {
  const { headerRow, cols, legacy } = detectTargetColumns(sheetRows);
  const pick = (r: unknown[], f: Field) => (cols[f] === undefined ? "" : r[cols[f]!]);

  const byInvoice = new Map<string, TargetRow>();
  let skipped = 0;
  for (const r of sheetRows.slice(headerRow + 1)) {
    const inv = text(pick(r, "invoice_no"));
    const rawTarget = pick(r, "target");
    if (!inv || text(rawTarget) === "") {
      if (inv || text(rawTarget) !== "") skipped++;
      continue;
    }
    // Invoice ganda: baris terakhir menang (sama dengan lookup sheet lama).
    byInvoice.set(inv, {
      invoice_no: inv,
      target: parseNumber(rawTarget),
      marketing: text(pick(r, "marketing")),
      collection_name: text(pick(r, "collection_name")),
      business_partner: text(pick(r, "business_partner")),
      due_date: parseDate(pick(r, "due_date")),
      branch: text(pick(r, "branch")),
    });
  }

  return { rows: [...byInvoice.values()], skipped, legacy, columns: cols };
}

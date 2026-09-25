import { parseDate } from "@/lib/parsers/date";
import { parseNumber } from "@/lib/parsers/number";

// Port mdlParse.bas + mdlImport.bas (Mutasi Bank VS Realisasi). Kolom dicari berdasarkan
// NAMA header (NormHeader/FindHeaderRow), karena posisi kolom berbeda antar file.

export type Account = { code: string; last4: string };
export type MutasiRow = { tx_date: string; amount: number; keterangan: string; catatan: string };
export type MutasiSheet = { account: string; sheet: string; dates: string[]; rows: MutasiRow[] };

const CATATAN_COL = 5; // kolom F file mutasi sumber

export const normHeader = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const text = (v: unknown) => String(v ?? "").trim();
const squash = (v: unknown) => text(v).replace(/\s+/g, " ");
const digitsOf = (s: string) => s.replace(/\D/g, "");

// Baris pertama (dalam maxScan baris) yang memuat SEMUA header wajib. cols[i] = indeks kolom.
export function findHeaderRow(rows: unknown[][], required: string[], maxScan: number) {
  const wanted = required.map(normHeader);
  for (let r = 0; r < Math.min(maxScan, rows.length); r++) {
    const cols = wanted.map(() => -1);
    (rows[r] ?? []).forEach((cell, c) => {
      const n = normHeader(cell);
      if (!n) return;
      const i = wanted.findIndex((w, k) => w === n && cols[k] < 0);
      if (i >= 0) cols[i] = c;
    });
    if (cols.every((c) => c >= 0)) return { row: r, cols };
  }
  return null;
}

function eachDate(from: string, to: string) {
  const out: string[] = [];
  for (let t = Date.parse(from + "T00:00:00Z"); t <= Date.parse(to + "T00:00:00Z"); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

// "SWITCHING PENGUIN" = transfer internal antar rekening, bukan uang masuk.
export const isSwitchingPenguin = (ket: string) => squash(ket).toLowerCase().includes("switching penguin");

// Satu sheet mutasi. null = rekening tidak ada di daftar (sheet diabaikan).
export function parseMutasiSheet(name: string, rows: unknown[][], accounts: Account[]): MutasiSheet | null {
  // 4 digit terakhir: dari nama sheet, ditimpa baris "No. rekening : ..." bila ada.
  let key = digitsOf(name);
  key = key.length >= 4 ? key.slice(-4) : "";
  const head = rows.slice(0, 15).map((r) => text(r?.[0]));
  const rek = head.find((t) => /rekening/i.test(t) && t.includes(":"));
  if (rek) {
    const d = digitsOf(rek.slice(rek.indexOf(":") + 1));
    if (d.length >= 4) key = d.slice(-4);
  }
  const acct = accounts.find((a) => a.last4 === key);
  if (!acct) return null;

  const dates = new Set<string>();
  // Periode: hari tanpa transaksi pun ikut di-replace.
  const periode = head.find((t) => /periode/i.test(t) && t.includes(":"));
  if (periode) {
    const parts = periode.slice(periode.indexOf(":") + 1).replace(/\s/g, "").split("-");
    if (parts.length >= 2) {
      const d1 = parseDate(parts[0]);
      const d2 = parseDate(parts[1]);
      if (d1 && d2 && d2 >= d1) eachDate(d1, d2).forEach((d) => dates.add(d));
    }
  }

  const out: MutasiRow[] = [];
  const hdr = findHeaderRow(rows, ["Tanggal Transaksi", "Keterangan", "Jumlah"], 30);
  if (hdr) {
    const [cDate, cKet, cJml] = hdr.cols;
    for (const r of rows.slice(hdr.row + 1)) {
      const dt = parseDate(r?.[cDate]);
      if (!dt) continue;
      dates.add(dt);
      const jumlah = text(r[cJml]);
      const keterangan = squash(r[cKet]);
      if (jumlah.toUpperCase().endsWith("CR") && !isSwitchingPenguin(keterangan)) {
        out.push({
          tx_date: dt,
          amount: parseNumber(jumlah),
          keterangan: keterangan.slice(0, 80),
          catatan: squash(r[CATATAN_COL]).slice(0, 120),
        });
      }
    }
  }
  return { account: acct.code, sheet: name, dates: [...dates].sort(), rows: out };
}

export function parseMutasiWorkbook(sheets: { name: string; rows: unknown[][] }[], accounts: Account[]) {
  const parsed = sheets.map((s) => parseMutasiSheet(s.name, s.rows, accounts));
  const found = parsed.filter((p): p is MutasiSheet => p !== null);
  if (!found.length) {
    throw new Error("Tidak ada sheet rekening yang cocok dengan daftar rekening (4 digit terakhir no. rekening).");
  }
  return { sheets: found, ignored: sheets.filter((_, i) => !parsed[i]).map((s) => s.name) };
}

// Template unduhan (sama dengan sheet template lama).
export const TEMPLATES: Record<"mutasi" | "erp" | "target", unknown[][]> = {
  mutasi: [
    ["Template Mutasi Rekening"], [], ["No. rekening : 7090334888"], [], ["Periode : 01/09/2026 - 01/09/2026"], [],
    ["Tanggal Transaksi", "Keterangan", "Cabang", "Jumlah", "Saldo"],
    ["01/09/2026", "TRSF E-BANKING CR PT CONTOH", "0000", "1,000,000.00 CR", "1,000,000.00"],
  ],
  // Laporan ERP "Invoice and Payment Date Comparison" (dipakai bersama Presentasi & Marketplace).
  erp: [["Organization :", "PT Penguin Trading"], ["Payment Group", ""], ["Date :", "01/09/2026", "/", "30/09/2026"], [],
    ["BP Key", "BP Name", "BP Location", "BP Group", "Marketing Group", "Branch", "Credit Limit", "Payment Term", "Invoice No.",
     "Invoice Amount", "Invoice Date", "Due Date", "Payment Document", "Payment Bank Account", "Payment Amount", "Payment Date", "PO No. Customer"]],
  target: [["Template Target"], [], [], [], [], ["Invoice No", "Open Amt"]],
};

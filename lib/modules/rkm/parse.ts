import { parseDate } from "@/lib/parsers/date";
import { parseNumber } from "@/lib/parsers/number";
import type { RkmGr, RkmKw } from "@/lib/local/datasets";

// File portal RKM (Excel, Sheet pertama) dibaca per NAMA header, bukan posisi:
//   GR RKM       : GRPO yang faktur pajaknya belum ada.
//   Kwitansi RKM : GRPO yang sudah bertukar faktur (No. Faktur Pajak, Pembuat, Tanggal Input).
// "No. Pengiriman" = No SJ di Master Aging (kunci pencocokan).

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[.\s]+/g, " ").replace(/\s*([()/-])\s*/g, "$1").trim();
const EMPTY = /^(-+|#n\/a|#value!|#ref!|null)?$/i;
const str = (v: unknown) => {
  const s = String(v ?? "").trim();
  return EMPTY.test(s) ? null : s;
};
const num = (v: unknown) => (str(v) === null ? null : parseNumber(v));
const date = (v: unknown) => (str(v) === null ? null : parseDate(typeof v === "string" ? v.trim() : v));

type Spec<T> = { [K in keyof T]?: { h: string[]; t: "s" | "n" | "d" | "sj" } };

const GR_SPEC: Spec<Omit<RkmGr, "id">> = {
  no: { h: ["no"], t: "s" },
  grpo_no: { h: ["no grpo"], t: "s" },
  no_sj: { h: ["no pengiriman"], t: "sj" },
  tgl_grpo: { h: ["tanggal grpo"], t: "d" },
  jumlah_grpo_grn: { h: ["jumlah grpo/grn"], t: "n" },
  no_faktur_pajak: { h: ["no faktur pajak"], t: "s" },
  tgl_pajak: { h: ["tanggal pajak"], t: "d" },
  jumlah: { h: ["jumlah"], t: "n" },
  selisih: { h: ["selisih"], t: "n" },
  cabang: { h: ["cabang"], t: "s" },
  no_po: { h: ["no po"], t: "s" },
  jumlah_grpo: { h: ["jumlah grpo"], t: "n" },
  no_grn: { h: ["no grn"], t: "s" },
  jumlah_grn: { h: ["jumlah grn"], t: "n" },
};

const KW_SPEC: Spec<Omit<RkmKw, "id">> = {
  no: { h: ["no"], t: "s" },
  grpo_no: { h: ["no grpo"], t: "s" },
  tgl_grpo: { h: ["tanggal grpo"], t: "d" },
  cabang: { h: ["cabang"], t: "s" },
  no_sj: { h: ["no pengiriman"], t: "sj" },
  no_po: { h: ["no po"], t: "s" },
  jumlah_grpo: { h: ["jumlah grpo"], t: "n" },
  no_grn: { h: ["no grn"], t: "s" },
  total_grn: { h: ["total grn"], t: "n" },
  total_grpo_grn: { h: ["total(grpo-grn)"], t: "n" },
  tgl_faktur_pajak: { h: ["tgl faktur pajak", "tanggal faktur pajak"], t: "d" },
  no_faktur_pajak: { h: ["no faktur pajak"], t: "s" },
  jumlah_faktur_pajak: { h: ["jumlah faktur pajak"], t: "n" },
  selisih: { h: ["selisih"], t: "n" },
  pembuat: { h: ["pembuat"], t: "s" },
  tanggal_input: { h: ["tanggal input"], t: "d" },
};

const REQUIRED = ["no grpo", "no pengiriman"];

function parseWith<T>(rows: unknown[][], spec: Spec<T>, label: string, required: string[]) {
  const hi = rows.slice(0, 10).findIndex((r) => {
    const hs = r.map(norm);
    return REQUIRED.every((h) => hs.includes(h));
  });
  if (hi < 0) throw new Error(`Bukan file ${label}: kolom "No. GRPO" dan "No. Pengiriman" tidak ditemukan.`);
  const header = rows[hi].map(norm);
  const missing = required.filter((h) => !header.includes(h));
  if (missing.length) throw new Error(`Bukan file ${label}: kolom ${missing.map((m) => `"${m}"`).join(", ")} tidak ditemukan.`);

  const cols = Object.entries(spec).map(([k, v]) => {
    const s = v as { h: string[]; t: string };
    return { k, t: s.t, i: header.findIndex((h) => s.h.includes(h)) };
  });
  const out: T[] = [];
  for (const r of rows.slice(hi + 1)) {
    const row: Record<string, unknown> = {};
    for (const c of cols) {
      const v = c.i < 0 ? null : r[c.i];
      row[c.k] = c.t === "n" ? num(v) : c.t === "d" ? date(v) : c.t === "sj" ? str(v)?.toUpperCase() ?? null : str(v);
    }
    if (!row.grpo_no && !row.no_sj) continue;
    out.push(row as T);
  }
  return out;
}

export const parseRkmGr = (rows: unknown[][]) =>
  parseWith<Omit<RkmGr, "id">>(rows, GR_SPEC, "GR RKM", ["no grpo", "no pengiriman", "tanggal grpo"]);

export const parseRkmKw = (rows: unknown[][]) =>
  parseWith<Omit<RkmKw, "id">>(rows, KW_SPEC, "Kwitansi RKM", ["no grpo", "no pengiriman", "no faktur pajak", "jumlah faktur pajak"]);

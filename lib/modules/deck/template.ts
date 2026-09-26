import { parseNumber } from "@/lib/parsers/number";

// Template Excel Presentasi AR: 1 slide = 1 sheet, diisi manual per bulan lalu di-upload kembali.
// Definisi tunggal DECK_SHEETS dipakai untuk export, parse, dan cek kelengkapan. Kunci seri sama dengan
// yang dibaca app presentasi (public/presentasi-app/js/engine/metrics.js).

export type Field = { key: string; label: string; optional?: boolean };
export type TableDef = { name: string; columns: string[] };
export type SheetDef = { name: string; slide: string; fields: Field[]; tables: TableDef[] };
export type Row = Record<string, string | number | null>;
export type MonthData = {
  v: 1;
  series: Record<string, number>;
  tables: Record<string, Row[]>;
  texts: Record<string, string>;
  sheets: Record<string, boolean>;
};

const CATS = ["TOP", "Ex DO", "CBD"];
const SCOPES: [string, string][] = [["all", "All"], ["trad", "Traditional"], ["res", "Reseller"]];
export const GROUPS = ["Traditional", "Reseller", "Modern Market Nasional", "Modern Market", "End User - Project"];
const SITES = ["Banjarmasin", "DKI Jakarta", "Makassar", "Palembang", "Pontianak", "Surabaya"];

const each = <T,>(xs: string[], f: (x: string, i: number) => T) => xs.map(f);

export const DECK_SHEETS: SheetDef[] = [
  {
    name: "Sales Performance", slide: "sales", tables: [],
    fields: [{ key: "sales", label: "Sales Total (Rp) — invoice seluruh kategori bulan ini" }],
  },
  {
    name: "Sales Mix", slide: "mix", tables: [],
    fields: [
      ...SCOPES.flatMap(([s, l]) => each(CATS, (c, i) => ({ key: `amt_${s}:${i}`, label: `Invoice Amount ${l} — ${c} (Rp)` }))),
      ...SCOPES.flatMap(([s, l]) => each(CATS, (c, i) => ({ key: `cnt_${s}:${i}`, label: `Jumlah Invoice ${l} — ${c}` }))),
    ],
  },
  {
    name: "Reseller & Site", slide: "reseller", tables: [],
    fields: [
      ...each(CATS, (c, i) => ({ key: `bp_res:${i}`, label: `BP Reseller aktif bertransaksi — ${c}` })),
      ...each(SITES, (s, i) => ({ key: `s7_amt:${i}`, label: `Reseller CBD ${s} — Amount (Rp)` })),
      ...each(SITES, (s, i) => ({ key: `s7_cnt:${i}`, label: `Reseller CBD ${s} — Jumlah invoice` })),
      ...each(SITES, (s, i) => ({ key: `s7_bp:${i}`, label: `Reseller CBD ${s} — Jumlah BP` })),
    ],
  },
  {
    name: "Collection", slide: "collection",
    fields: [
      { key: "coll_week", label: "Minggu ke (W) untuk kolom 's/d minggu W'" },
      ...each(GROUPS, (g, i) => ({ key: `coll_tgt:${i}`, label: `Collection Target — ${g} (Rp)` })),
      ...each(GROUPS, (g, i) => ({ key: `coll_act:${i}`, label: `Actual Collection akhir bulan — ${g} (Rp)` })),
      ...each(GROUPS, (g, i) => ({ key: `coll_w:${i}`, label: `Collection s/d minggu W — ${g} (Rp)` })),
      ...each(GROUPS, (g, i) => ({ key: `tgt_next:${i}`, label: `Target Collection bulan berikutnya — ${g} (Rp)`, optional: true })),
      { key: "top5_tgt", label: "TOP 5 — Target (Rp)", optional: true },
      { key: "top5_act", label: "TOP 5 — Actual (Rp)", optional: true },
      { key: "top5_w", label: "TOP 5 — s/d minggu W (Rp)", optional: true },
      { key: "wo5_tgt", label: "Tanpa TOP 5 — Target (Rp)", optional: true },
      { key: "wo5_act", label: "Tanpa TOP 5 — Actual (Rp)", optional: true },
      { key: "wo5_w", label: "Tanpa TOP 5 — s/d minggu W (Rp)", optional: true },
    ],
    tables: [{ name: "Top Unpaid W", columns: ["Payment Group", "Unpaid (Rp)"] }],
  },
  {
    name: "Uncollected Watchlist", slide: "watch", fields: [],
    tables: [{
      name: "Uncollected",
      columns: ["Tabel", "No", "Payment Group", "Unpaid This Month (Rp)", "T.O.P", "Late Days Bulan Ini",
        "Late Days Bulan -1", "Late Days Bulan -2", "Category", "Keterangan"],
    }],
  },
  {
    name: "Aging & Overdue", slide: "aging", tables: [],
    fields: [
      { key: "open", label: "Open Amount — total outstanding (Rp)" },
      { key: "aging:0", label: "Invoice Due 1-15 hari (Rp)" },
      { key: "aging:1", label: "Invoice Due 16-30 hari (Rp)" },
      { key: "aging:2", label: "Invoice Due 31-60 hari (Rp)" },
      { key: "aging:3", label: "Invoice Due 61-90 hari (Rp)" },
      { key: "over90", label: "Total tagihan > 90 hari (Rp)" },
      { key: "aging:5", label: "Bad Debt (Rp)" },
      { key: "due120", label: "Invoice Due > 120 hari (Rp)" },
      ...each(GROUPS, (g, i) => ({ key: `baddebt:${i}`, label: `Tagihan > 90 hari — ${g} (Rp)` })),
    ],
  },
  {
    name: "AR Summary", slide: "ar", tables: [],
    fields: [
      { key: "pay_amt", label: "Pembayaran diterima bulan ini (Rp)" },
      { key: "collpct:0", label: "Collection % (pecahan, mis. 0,85 = 85%)" },
      { key: "late_all", label: "Rata-rata keterlambatan bayar (hari)" },
      { key: "late_n", label: "Jumlah invoice dibayar terlambat" },
      { key: "ardays:0", label: "AR Days TOP (hari) — kosongkan untuk dihitung otomatis", optional: true },
    ],
  },
  {
    name: "Risiko Piutang", slide: "risk", fields: [],
    tables: [
      { name: "Due90 Summary", columns: ["Jenis", "Nominal (Rp)"] },
      { name: "Due90 Cicil", columns: ["Business Partner", "Key BP", "Payment Group", "Marketing Group", "Region",
        "Amount Bulan Lalu (Rp)", "Payment (Rp)", "Amount Bulan Ini (Rp)", "Keterangan"] },
      { name: "Bad Debt Summary", columns: ["Keterangan", "Catatan", "Nominal (Rp)"] },
      { name: "Bad Debt Detail", columns: ["Business Partner", "Key BP", "Marketing Group", "Region", "Amount (Rp)", "Information"] },
      { name: "Unallocated", columns: ["Jenis", "Keterangan", "Marketing Group", "Total (Rp)"] },
    ],
  },
];

export const SHEET_TOTAL = DECK_SHEETS.length;
export const LABELS: Record<string, string> = Object.fromEntries(DECK_SHEETS.flatMap((s) => s.fields.map((f) => [f.key, f.label])));
const NUMERIC_COL = /\(Rp\)|^Late Days|^No$/;

export const emptyMonth = (): MonthData => ({ v: 1, series: {}, tables: {}, texts: {}, sheets: {} });

// Sheet terisi: sheet nilai → semua nilai wajib berupa angka; sheet tabel saja → sheet ada di file.
export function sheetFilled(def: SheetDef, d: Pick<MonthData, "series" | "sheets">) {
  if (!d.sheets[def.name]) return false;
  return def.fields.every((f) => f.optional || Number.isFinite(d.series[f.key]));
}
export function completeness(d: Pick<MonthData, "series" | "sheets">) {
  const filled = DECK_SHEETS.filter((s) => sheetFilled(s, d)).length;
  return { filled, total: SHEET_TOTAL, complete: filled === SHEET_TOTAL };
}

// ── Export: array-of-arrays per sheet (diisi nilai yang sudah tersimpan) ──
export function templateSheets(month: string, d: MonthData = emptyMonth()): { name: string; rows: unknown[][] }[] {
  const guide: unknown[][] = [
    ["Template Presentasi AR"], ["Bulan", month], [],
    ["Cara pakai"],
    ["1. Isi kolom Nilai di setiap sheet (satu sheet = satu slide). Angka dalam Rupiah penuh, bukan juta."],
    ["2. Tabel diisi di bawah penanda #TABEL; tambah baris sesuai kebutuhan, jangan ubah judul kolom."],
    ["3. Jangan ubah kolom Kunci dan nama sheet."],
    ["4. Upload kembali di Presentasi AR → Data Center, setelah memilih bulan yang sama."],
    ["5. Nilai bertanda (opsional) boleh dikosongkan; sheet lain wajib lengkap agar bulan tercentang."],
  ];
  const out = [{ name: "Petunjuk", rows: guide }];
  for (const s of DECK_SHEETS) {
    const rows: unknown[][] = [[`${s.name}`], ["Bulan", month], []];
    if (s.fields.length) {
      rows.push(["Kunci", "Keterangan", "Nilai"]);
      for (const f of s.fields) rows.push([f.key, f.optional ? `${f.label} (opsional)` : f.label, d.series[f.key] ?? ""]);
    }
    for (const t of s.tables) {
      rows.push([], [`#TABEL ${t.name}`], t.columns);
      for (const r of d.tables[t.name] ?? []) rows.push(t.columns.map((c) => r[c] ?? ""));
    }
    out.push({ name: s.name, rows });
  }
  return out;
}

// ── Parse upload ─────────────────────────────────────────────────
const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const numOrNull = (v: unknown) => {
  if (v === null || v === undefined || text(v) === "" || text(v) === "-") return null;
  const n = typeof v === "number" ? v : parseNumber(v);
  return Number.isFinite(n) ? n : null;
};
const monthOf = (v: unknown) => {
  if (typeof v === "number" && v > 30000) { const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000); return d.toISOString().slice(0, 7); }
  const m = /^(\d{4})-(\d{1,2})/.exec(text(v));
  return m ? `${m[1]}-${m[2].padStart(2, "0")}` : "";
};

export type ParseResult = { data: MonthData; fileMonth: string; missingSheets: string[]; warnings: string[] };

export function parseTemplate(sheets: { name: string; rows: unknown[][] }[], keepTexts: Record<string, string> = {}): ParseResult {
  const data: MonthData = { ...emptyMonth(), texts: { ...keepTexts } };
  const byName = new Map(sheets.map((s) => [s.name.trim().toLowerCase(), s.rows]));
  const warnings: string[] = [];
  const missingSheets: string[] = [];
  let fileMonth = "";
  if (!DECK_SHEETS.some((s) => byName.has(s.name.toLowerCase()))) {
    throw new Error("Bukan template Presentasi AR: tidak ada sheet yang dikenali (mis. 'Sales Performance', 'Aging & Overdue').");
  }
  for (const s of DECK_SHEETS) {
    const rows = byName.get(s.name.toLowerCase());
    if (!rows) { missingSheets.push(s.name); continue; }
    data.sheets[s.name] = true;
    const monthRow = rows.slice(0, 6).find((r) => text(r[0]).toLowerCase() === "bulan");
    const fm = monthRow ? monthOf(monthRow[1]) : "";
    if (fm && !fileMonth) fileMonth = fm;

    const keys = new Set(s.fields.map((f) => f.key));
    for (const r of rows) {
      const k = text(r[0]);
      if (!keys.has(k)) continue;
      const v = numOrNull(r[2]);
      if (v !== null) data.series[k] = v;
      else if (text(r[2]) !== "") warnings.push(`${s.name}: nilai "${text(r[2])}" untuk ${k} bukan angka — diabaikan.`);
    }

    for (const t of s.tables) {
      const at = rows.findIndex((r) => text(r[0]).toLowerCase() === `#tabel ${t.name}`.toLowerCase());
      if (at < 0) continue;
      const head = (rows[at + 1] ?? []).map(text);
      const out: Row[] = [];
      for (let i = at + 2; i < rows.length; i++) {
        const r = rows[i] ?? [];
        if (text(r[0]).startsWith("#")) break;
        if (!r.some((x) => text(x) !== "")) { if (out.length) break; continue; }
        const o: Row = {};
        t.columns.forEach((c) => {
          const j = head.indexOf(c);
          const v = j >= 0 ? r[j] : null;
          o[c] = NUMERIC_COL.test(c) ? numOrNull(v) : text(v) || null;
        });
        out.push(o);
      }
      data.tables[t.name] = out;
    }
  }
  return { data, fileMonth, missingSheets, warnings };
}

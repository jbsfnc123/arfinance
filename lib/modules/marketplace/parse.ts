import type { WorkBook, WorkSheet } from "xlsx";
import { excelSerialToISO } from "@/lib/parsers/date";
import { PLATFORMS, TEXT_KEYS, TIKTOK_COLS, SHOPEE_COLS, type Platform } from "./config";

// Parser file laporan marketplace — port langsung dari MarketPlace/index.html.
// Modul SheetJS dioper sebagai parameter supaya bisa dimuat dinamis di browser dan dites di Node.

type XlsxLib = typeof import("xlsx");
export type Row = Record<string, string | number>;
type Cell = unknown;

export type Report = {
  meta: { platform: Platform; username: string; dari: string; ke: string; reportId: string };
  summary: Record<string, number>;
  adjustmentSummary: Record<string, number>;
  balanceSummary: Record<string, number>;
  Orders: Row[];
  Items: Row[];
  SellerFee: Row[];
  Adjustment: Row[];
  ShippingDiscrepancy: Row[];
  Withdrawals: Row[];
  Balance: Row[];
  Erp: Row[];
  erpMeta: { org?: string; paymentGroup?: string; dari?: string; ke?: string };
};

export type BalanceOnly = Pick<Report, "meta" | "balanceSummary" | "Balance">;
export type ErpFile = Pick<Report, "erpMeta" | "Erp">;

// ── util dasar (sama dengan versi lama) ─────────────────────────────
export const num = (v: Cell): number => {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  const s = String(v).trim();
  if (!s || s === "-" || s === "/") return 0;
  const n = Number(s.replace(/,/g, ""));
  return Number.isNaN(n) ? 0 : n;
};
export const txt = (v: Cell): string => (v == null || v === "-" ? "" : String(v).trim());
// Serial Excel bisa berisi jam (pecahan) — yang diambil hanya bagian tanggalnya.
export const toDate = (v: Cell): string =>
  typeof v === "number" && v > 20000 ? excelSerialToISO(Math.floor(v + 1e-6)) : txt(v).slice(0, 10).replace(/\//g, "-");

// nilai angka pertama setelah kolom label (posisi kolom nilai bisa bergeser)
const firstNum = (r: Cell[]): number | null => {
  for (let i = 1; i < r.length; i++) {
    if (typeof r[i] === "number") return r[i] as number;
    if (/^-?\d+(\.\d+)?$/.test(txt(r[i]))) return Number(txt(r[i]));
  }
  return null;
};

export function sheetRows(XLSX: XlsxLib, wb: WorkBook, name: string): Cell[][] | null {
  const key = wb.SheetNames.find((n) => n.trim().toLowerCase() === name.toLowerCase());
  if (!key) return null;
  const ws: WorkSheet = wb.Sheets[key];
  // Sebagian export (mis. TikTok) punya '!ref' lebih pendek dari isi; rentang dihitung ulang.
  let maxR = 0, maxC = 0;
  for (const k of Object.keys(ws)) {
    if (k[0] === "!") continue;
    const c = XLSX.utils.decode_cell(k);
    if (c.r > maxR) maxR = c.r;
    if (c.c > maxC) maxC = c.c;
  }
  return XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, defval: null, raw: true, range: { s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } } });
}

const findRow = (rows: Cell[][], pred: (r: Cell[]) => boolean, from = 0) => {
  for (let i = from; i < rows.length; i++) if (pred(rows[i] || [])) return i;
  return -1;
};

const DATE_KEY = /^tgl|tanggal|cairLama|Date$/;

function mapTable(rows: Cell[][], headerIdx: number, map: Record<string, string>, stopFn?: (r: Cell[]) => boolean) {
  const header = rows[headerIdx].map((h) => txt(h));
  const idx: Record<string, number> = {};
  for (const [k, title] of Object.entries(map)) idx[k] = header.indexOf(title);
  const out: { row: Cell[]; obj: Row }[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (stopFn && stopFn(r)) break;
    if (r.every((v) => v == null || v === "")) continue;
    const o: Row = {};
    for (const k in map) {
      const v = idx[k] >= 0 ? r[idx[k]] : null;
      o[k] = TEXT_KEYS.has(k) ? (DATE_KEY.test(k) ? toDate(v) : txt(v)) : num(v);
    }
    out.push({ row: r, obj: o });
  }
  return out;
}

const empty = (): Omit<Report, "meta"> => ({
  summary: {}, adjustmentSummary: {}, balanceSummary: {}, Orders: [], Items: [], SellerFee: [], Adjustment: [],
  ShippingDiscrepancy: [], Withdrawals: [], Balance: [], Erp: [], erpMeta: {},
});

export const emptyReport = (meta: Report["meta"]): Report => ({ meta, ...empty() });

// ── Shopee ─────────────────────────────────────────────────────────
function parseShopee(XLSX: XlsxLib, wb: WorkBook): Report {
  const sum = sheetRows(XLSX, wb, "Summary")!;
  const peng = sheetRows(XLSX, wb, "Penghasilan")!;
  const summary: Record<string, number> = {};
  const meta = { platform: "shopee" as Platform, username: "", dari: "", ke: "", reportId: "" };
  for (const r of sum) {
    const label = txt(r[0]).replace(/^\d+\.\s*/, "");
    if (!label) continue;
    if (label === "Username (Penjual)") meta.username = txt(r[1]);
    else if (label === "Dari") meta.dari = toDate(r[1]);
    else if (label === "ke") meta.ke = toDate(r[1]);
    else {
      const v = firstNum(r);
      if (v !== null) summary[label] = v;
    }
  }
  if (!meta.dari) throw new Error("Periode laporan (Dari/ke) tidak ditemukan di sheet Summary.");
  meta.username = meta.username || "toko";
  meta.reportId = `shopee_${meta.username}_${meta.dari}_${meta.ke}`;

  const h = findRow(peng, (r) => r.some((v) => txt(v) === "No. Pesanan") && r.some((v) => txt(v) === "Lihat berdasarkan"));
  if (h < 0) throw new Error('Header sheet "Penghasilan" tidak ditemukan.');
  const viewIdx = peng[h].findIndex((v) => txt(v) === "Lihat berdasarkan");
  const Orders: Row[] = [], Items: Row[] = [];
  for (const { row, obj } of mapTable(peng, h, { idProduk: "ID Produk", produk: "Nama Produk", ...SHOPEE_COLS })) {
    const view = txt(row[viewIdx]).toLowerCase();
    if (view === "order") {
      const { idProduk: _i, produk: _p, ...o } = obj;
      void _i; void _p;
      Orders.push(o);
    } else if (view === "sku") {
      Items.push({ no: obj.no, idProduk: obj.idProduk, produk: obj.produk, qty: 0, harga: obj.harga, refund: obj.refund, penghasilan: obj.penghasilan });
    }
  }

  let SellerFee: Row[] = [];
  const sf = sheetRows(XLSX, wb, "Seller Fee");
  if (sf) {
    const i = findRow(sf, (r) => r.some((v) => txt(v) === "No. Pesanan"));
    if (i >= 0) SellerFee = mapTable(sf, i, {
      no: "No. Pesanan", platform: "Biaya Platform", xtra: "Biaya Gratis Ongkir XTRA",
      layanan: "Biaya Layanan", promosi: "Biaya Promosi", lainnya: "Biaya Lainnya",
    }).map((x) => x.obj).filter((x) => x.no);
  }

  let Adjustment: Row[] = [];
  const adjustmentSummary: Record<string, number> = {};
  const adj = sheetRows(XLSX, wb, "Adjustment");
  if (adj) {
    const s = findRow(adj, (r) => txt(r[0]) === "Ringkasan Biaya Penyesuaian");
    const d = findRow(adj, (r) => txt(r[0]) === "No.");
    if (s >= 0) for (let i = s + 1; i < (d < 0 ? adj.length : d); i++) {
      const r = adj[i] || [];
      const v = firstNum(r);
      if (txt(r[0]) && v !== null) adjustmentSummary[txt(r[0])] = v;
    }
    if (d >= 0) Adjustment = mapTable(adj, d, {
      tanggal: "Tanggal Penyesuaian Dibuat", deskripsi: "Tipe Penyesuaian | Deskripsi",
      alasan: "Alasan Penyesuaian", nilai: "Biaya Penyesuaian", no: "No. Pesanan Terhubung",
      cairLama: "Tanggal Dana Dilepaskan",
    }, (r) => typeof r[0] !== "number" && !/^\d+$/.test(txt(r[0]))).map((x) => x.obj);
  }

  let ShippingDiscrepancy: Row[] = [];
  const sd = sheetRows(XLSX, wb, "Shipping Fee Discrepancy");
  if (sd) {
    const i = findRow(sd, (r) => txt(r[0]) === "No. Pesanan");
    if (i >= 0) ShippingDiscrepancy = mapTable(sd, i, {
      no: "No. Pesanan", estimasi: "Estimasi Ongkos Kirim:",
      dibayar: "Ongkos Kirim yang Dibayarkan ke Jasa Kirim:", alasan: "Discrepancy reason",
    }).map((x) => x.obj).filter((x) => x.no);
  }

  return { ...empty(), meta, summary, adjustmentSummary, Orders, Items, SellerFee, Adjustment, ShippingDiscrepancy };
}

// ── TikTok ─────────────────────────────────────────────────────────
function parseTiktok(XLSX: XlsxLib, wb: WorkBook): Report {
  const lap = sheetRows(XLSX, wb, "Laporan");
  const det = sheetRows(XLSX, wb, "Detail pesanan")!;
  const summary: Record<string, number> = {};
  const meta = { platform: "tiktok" as Platform, username: "toko", dari: "", ke: "", reportId: "" };
  for (const r of lap || []) {
    const label = txt(r.find((v) => txt(v)) ?? "");
    if (!label) continue;
    const vals = r.filter((v) => txt(v));
    const val = txt(vals[vals.length - 1]);
    if (label === "Periode") {
      const m = val.match(/(\d{4}[-/]\d{2}[-/]\d{2}).*?(\d{4}[-/]\d{2}[-/]\d{2})/);
      if (m) { meta.dari = m[1].replace(/\//g, "-"); meta.ke = m[2].replace(/\//g, "-"); }
    } else if (label === "Toko" || label === "Nama toko") meta.username = val;
    else {
      const v = firstNum([label, ...r.slice(1)]);
      if (v !== null) summary[label] = v;
    }
  }
  if (!meta.dari) throw new Error('Periode laporan tidak ditemukan di sheet "Laporan".');
  meta.reportId = `tiktok_${meta.username}_${meta.dari}_${meta.ke}`;

  const h = findRow(det, (r) => r.some((v) => txt(v) === "ID Pesanan/Penyesuaian"));
  if (h < 0) throw new Error('Header sheet "Detail pesanan" tidak ditemukan.');
  const Orders: Row[] = [], Items: Row[] = [], Adjustment: Row[] = [];
  for (const o of mapTable(det, h, TIKTOK_COLS).map((x) => x.obj).filter((o) => o.no)) {
    if (/penyesuaian|adjustment/i.test(String(o.tipe))) {
      Adjustment.push({ tanggal: o.tglPesan, deskripsi: o.tipe, alasan: "", nilai: Number(o.penyesuaian) || Number(o.penghasilan), no: o.noTerkait || o.no, cairLama: o.tglCair });
      continue;
    }
    Orders.push(o);
    // "Detail produk terjual" = "<idProduk> * <qty>;" — penghasilan dibagi sesuai porsi qty
    const list = txt(o.produkDetail).split(";").map((s) => s.trim()).filter((s) => s && s !== "/")
      .map((p) => {
        const m = p.match(/^(\S+)\s*\*\s*(\d+)/);
        return m ? { id: m[1], qty: Number(m[2]) } : { id: p, qty: 1 };
      });
    const totalQty = list.reduce((a, x) => a + x.qty, 0) || 1;
    for (const x of list) {
      Items.push({
        no: o.no, idProduk: x.id, produk: "Produk " + x.id, qty: x.qty,
        harga: (Number(o.harga) * x.qty) / totalQty, refund: (Number(o.refund) * x.qty) / totalQty,
        penghasilan: (Number(o.penghasilan) * x.qty) / totalQty,
      });
    }
  }

  let Withdrawals: Row[] = [];
  const wd = sheetRows(XLSX, wb, "Riwayat penarikan");
  if (wd) {
    const i = findRow(wd, (r) => txt(r[0]) === "Jenis transaksi");
    if (i >= 0) Withdrawals = mapTable(wd, i, {
      jenis: "Jenis transaksi", refId: "ID referensi", tglMinta: "Waktu permintaan",
      nilai: "Total", status: "Status", tglSukses: "Waktu keberhasilan", rekening: "Rekening bank",
    }).map((x) => x.obj).filter((x) => x.jenis);
  }

  return { ...empty(), meta, summary, Orders, Items, Adjustment, Withdrawals };
}

// ── Riwayat saldo Shopee ───────────────────────────────────────────
function parseBalanceShopee(XLSX: XlsxLib, wb: WorkBook): BalanceOnly {
  const rows = sheetRows(XLSX, wb, "Transaction Report")!;
  const meta = { platform: "shopee" as Platform, username: "toko", dari: "", ke: "", reportId: "" };
  const balanceSummary: Record<string, number> = {};
  for (const r of rows) {
    const label = txt(r[0]);
    if (label === "Username (Penjual)") meta.username = txt(r[1]);
    else if (label === "Dari") meta.dari = toDate(r[1]);
    else if (label === "Ke" || label === "ke") meta.ke = toDate(r[1]);
    else if (label === "Total Saldo Masuk" || label === "Total Saldo Keluar") {
      const v = firstNum(r);
      if (v !== null) balanceSummary[label] = v;
    }
  }
  if (!meta.dari) throw new Error('Periode (Dari/Ke) tidak ditemukan di sheet "Transaction Report".');
  meta.reportId = `shopee_${meta.username}_${meta.dari}_${meta.ke}`;

  const h = findRow(rows, (r) => txt(r[0]) === "Tanggal Transaksi");
  if (h < 0) throw new Error("Header tabel transaksi tidak ditemukan.");
  const Balance = mapTable(rows, h, {
    waktu: "Tanggal Transaksi", tipe: "Tipe Transaksi", deskripsi: "Deskripsi", no: "No. Pesanan",
    arah: "Jenis Transaksi", nilai: "Jumlah", status: "Status", saldoAkhir: "Saldo Akhir",
  }).map((x) => x.obj)
    // baris header terulang di tengah data → hanya ambil yang waktunya benar-benar tanggal
    .filter((x) => /^\d{4}-\d{2}-\d{2}/.test(String(x.waktu)))
    .map((x) => ({ ...x, tanggal: String(x.waktu).slice(0, 10) }));

  return { meta, balanceSummary, Balance };
}

// ── Tarikan ERP (invoice vs payment) ───────────────────────────────
export function parseErp(XLSX: XlsxLib, wb: WorkBook): ErpFile {
  let rows: Cell[][] | null = null;
  for (const n of wb.SheetNames) {
    const r = sheetRows(XLSX, wb, n);
    if (r && findRow(r, (x) => x.some((v) => txt(v) === "Invoice No.")) >= 0) { rows = r; break; }
  }
  if (!rows) throw new Error('File ERP tidak dikenali: kolom "Invoice No." tidak ditemukan.');

  const erpMeta: Report["erpMeta"] = {};
  for (const r of rows.slice(0, 12)) {
    const label = txt(r[0]).replace(/[\t:]/g, "").trim().toLowerCase();
    const vals = r.slice(1).filter((v) => v != null && v !== "" && v !== "/");
    if (label === "organization") erpMeta.org = txt(vals[0]);
    else if (label === "payment group") erpMeta.paymentGroup = txt(vals[0]);
    else if (label === "date") { erpMeta.dari = toDate(vals[0]); erpMeta.ke = toDate(vals[1]); }
  }

  const h = findRow(rows, (x) => x.some((v) => txt(v) === "Invoice No."));
  const Erp = mapTable(rows, h, {
    bpName: "BP Name", lokasi: "BP Location", cabang: "Branch", invoiceNo: "Invoice No.",
    invoiceAmount: "Invoice Amount", invoiceDate: "Invoice Date", paymentDoc: "Payment Document",
    paymentAmount: "Payment Amount", paymentDate: "Payment Date", hari: "days", no: "PO No. Customer",
  }).map((x) => x.obj).filter((x) => x.invoiceNo).map((x) => ({ ...x, no: x.no === "-" ? "" : x.no }));

  return { erpMeta, Erp };
}

export type ParsedFile =
  | { kind: "report"; data: Report }
  | { kind: "balance"; data: BalanceOnly };

export function parseWorkbook(XLSX: XlsxLib, wb: WorkBook): ParsedFile {
  if (sheetRows(XLSX, wb, "Transaction Report")) return { kind: "balance", data: parseBalanceShopee(XLSX, wb) };
  if (sheetRows(XLSX, wb, "Summary") && sheetRows(XLSX, wb, "Penghasilan")) return { kind: "report", data: parseShopee(XLSX, wb) };
  if (sheetRows(XLSX, wb, "Detail pesanan") && sheetRows(XLSX, wb, "Laporan")) return { kind: "report", data: parseTiktok(XLSX, wb) };
  throw new Error('File tidak dikenali. Gunakan Laporan Penghasilan Shopee (sheet "Summary" + "Penghasilan"), Riwayat Saldo Shopee (sheet "Transaction Report"), atau Laporan TikTok (sheet "Laporan" + "Detail pesanan").');
}

export const platformOf = (R: Report) => PLATFORMS[R.meta.platform] ?? PLATFORMS.shopee;

import { platformOf, type Report, type Row } from "./parse";
import { feeBreakdown, fmt, groupSum, hasBalance, subsidiOrder, type AuditRow } from "./analysis";

// Definisi kolom & isi tabel drill-down (port RECON_COLS, AUDIT_COLS, ERP_COLS, showOrder, showErpDetail).

export type Col = { k: string; l: string; n?: boolean; link?: boolean; erpLink?: boolean };
type SecRow = Record<string, unknown> & { sec?: boolean };

export const RECON_COLS: Col[] = [
  { k: "no", l: "No. Pesanan", link: true }, { k: "tanggal", l: "Tanggal" },
  { k: "laporan", l: "Menurut Laporan", n: true }, { k: "saldo", l: "Masuk ke Saldo", n: true },
  { k: "selisih", l: "Selisih", n: true }, { k: "waktu", l: "Waktu Masuk" },
  { k: "status", l: "Status" }, { k: "keterangan", l: "Keterangan" },
];

export const AUDIT_COLS: Col[] = [
  { k: "no", l: "No. Pesanan", link: true }, { k: "tanggal", l: "Tanggal" },
  { k: "diterimaTxt", l: "Dana Diterima" }, { k: "ditarik", l: "Dana Ditarik", n: true },
  { k: "selisih", l: "Selisih", n: true }, { k: "status", l: "Status" },
  { k: "waktuTarik", l: "Waktu Tarik (saldo)" }, { k: "kas", l: "Kas" },
  { k: "sumber", l: "Sumber Data" }, { k: "keterangan", l: "Keterangan" },
];

export const auditForTable = (rows: AuditRow[]) =>
  rows.map((r) => ({ ...r, diterimaTxt: r.diterima === null ? "tidak diketahui" : r.diterima.toLocaleString("id-ID") }));

export const ERP_COLS: Col[] = [
  { k: "no", l: "No. Pesanan", erpLink: true }, { k: "invoiceNo", l: "No. Invoice" },
  { k: "invoice", l: "Invoice Amount", n: true }, { k: "payment", l: "Payment Amount", n: true },
  { k: "selisihErp", l: "Selisih ERP", n: true }, { k: "biaya", l: "Biaya Marketplace", n: true },
  { k: "subsidi", l: "Subsidi (invoice terpisah)", n: true },
  { k: "takTerjelaskan", l: "Tidak Terjelaskan", n: true }, { k: "status", l: "Status" }, { k: "keterangan", l: "Keterangan" },
];

export function orderTableCols(R: Report): Col[] {
  const P = platformOf(R);
  const cols: Col[] = [{ k: "no", l: "No. Pesanan", link: true }, { k: "tglPesan", l: "Tgl Pesan" }, { k: "tglCair", l: "Tgl Dana Cair" }];
  if (R.meta.platform === "shopee") cols.push({ k: "pembeli", l: "Pembeli" });
  cols.push({ k: "metodeBayar", l: P.labels.dist1 });
  if (P.labels.dist2Key === "jasaKirim") cols.push({ k: "jasaKirim", l: "Jasa Kirim" });
  cols.push({ k: "harga", l: P.labels.harga, n: true }, { k: "refund", l: "Refund", n: true });
  for (const g of Object.keys(P.groups)) cols.push({ k: "g_" + g, l: P.groups[g].label, n: true });
  cols.push({ k: "penghasilan", l: "Dana Diterima", n: true });
  return cols;
}

export const withGroups = (R: Report, rows: Row[]) =>
  rows.map((r) => {
    const x: Record<string, unknown> = { ...r };
    for (const g of Object.keys(platformOf(R).groups)) x["g_" + g] = groupSum(R, r, g);
    return x;
  });

const DETAIL_COLS: Col[] = [{ k: "f", l: "Keterangan" }, { k: "v", l: "Nilai" }];

// Detail lengkap satu pesanan dari semua sheet.
export function orderDetail(R: Report, no: string, audit: AuditRow[]) {
  const P = platformOf(R);
  const o = R.Orders.find((r) => r.no === no);
  const items = R.Items.filter((i) => i.no === no);
  const fees = R.SellerFee.filter((s) => s.no === no);
  const adjs = R.Adjustment.filter((a) => a.no === no);
  const ships = R.ShippingDiscrepancy.filter((s) => s.no === no);
  const muts = hasBalance(R) ? R.Balance.filter((b) => b.no === no) : [];
  const aud = audit.filter((a) => a.no === no);
  if (!o && !items.length && !fees.length && !adjs.length && !ships.length && !muts.length) return null;

  const rows: SecRow[] = [];
  const sec = (t: string) => rows.push({ f: t, v: "", sec: true });
  const add = (f: string, v: unknown) => rows.push({ f, v: typeof v === "number" ? fmt(v) : v });

  if (o) {
    sec("Informasi Pesanan");
    for (const k of ["no", "tglPesan", "tglCair", "metodeCair", "tipe", "pembeli", "dibayarPembeli", "metodeBayar", "cicilan", "jasaKirim", "kurir", "voucher", "noTerkait", "beratPaket"]) {
      if (P.cols[k] && o[k] !== undefined && o[k] !== "" && o[k] !== 0) add(P.cols[k], o[k]);
    }
    sec("Rincian Dana");
    add(P.labels.harga, Number(o.harga));
    add("Refund ke Pembeli", Number(o.refund));
    for (const g of Object.keys(P.groups)) {
      for (const k of P.groups[g].keys) if (Number(o[k])) add(`${P.groups[g].label} › ${P.cols[k] || k}`, Number(o[k]));
    }
    add("TOTAL DANA DITERIMA", Number(o.penghasilan));
  } else sec("Pesanan tidak ada di data pesanan periode ini (hanya data terkait)");

  if (aud.length) {
    sec("Analisis Refund");
    for (const a of aud) {
      add("Dana diterima", a.diterima === null ? "tidak diketahui" : fmt(a.diterima));
      add("Dana ditarik", a.ditarik);
      add("Selisih", a.selisih);
      add("Status", `${a.status} · ${a.sumber}`);
    }
  }
  if (items.length) {
    sec(`Produk (${items.length})`);
    for (const i of items) add(`${i.produk}${Number(i.qty) ? " × " + i.qty : ""}`, `Harga ${fmt(Number(i.harga))} · Refund ${fmt(Number(i.refund))} · Dana diterima ${fmt(Number(i.penghasilan))}`);
  }
  if (muts.length) {
    sec(`Mutasi Saldo (${muts.length})`);
    for (const b of muts) add(`${b.waktu} · ${b.tipe}`, `${fmt(Number(b.nilai))} · saldo setelahnya ${fmt(Number(b.saldoAkhir))}`);
  }
  if (fees.length) {
    sec("Seller Fee");
    for (const s of fees) {
      add("Biaya Platform", Number(s.platform)); add("Biaya Gratis Ongkir XTRA", Number(s.xtra));
      add("Biaya Layanan", Number(s.layanan)); add("Biaya Promosi", Number(s.promosi)); add("Biaya Lainnya", Number(s.lainnya));
    }
  }
  if (adjs.length) {
    sec(`Penyesuaian (${adjs.length})`);
    for (const a of adjs) add(`${a.tanggal} · ${a.deskripsi}${a.alasan ? " — " + a.alasan : ""}`, Number(a.nilai));
  }
  if (ships.length) {
    sec("Selisih Ongkos Kirim");
    for (const s of ships) {
      add("Estimasi Ongkos Kirim", Number(s.estimasi)); add("Dibayar ke Jasa Kirim", Number(s.dibayar));
      add("Selisih", Number(s.dibayar) - Number(s.estimasi)); add("Alasan", s.alasan);
    }
  }
  return { title: "Detail Pesanan " + no, rows, cols: DETAIL_COLS, noFoot: true };
}

// Rincian selisih ERP satu pesanan: invoice/payment + komponen biaya marketplace.
export function erpDetail(R: Report, no: string) {
  const P = platformOf(R);
  const e = R.Erp.find((x) => x.no === no);
  const o = R.Orders.find((x) => x.no === no);
  const rows: SecRow[] = [];
  const sec = (t: string) => rows.push({ f: t, v: "", sec: true });
  const add = (f: string, v: unknown) => rows.push({ f, v: typeof v === "number" ? fmt(v) : v });

  sec("Catatan ERP");
  if (e) {
    add("No. Invoice", e.invoiceNo); add("Tanggal Invoice", e.invoiceDate);
    add("Invoice Amount", Number(e.invoiceAmount)); add("Dokumen Pembayaran", e.paymentDoc);
    add("Tanggal Pembayaran", e.paymentDate); add("Payment Amount", Number(e.paymentAmount));
    add("Selisih Invoice − Payment", Number(e.invoiceAmount) - Number(e.paymentAmount));
    add("Pelanggan", `${e.bpName || "-"} · ${e.lokasi || "-"} · ${e.cabang || "-"}`);
  } else add("Status", "Tidak ada invoice ERP untuk pesanan ini");

  if (o) {
    sec("Rincian selisih menurut laporan marketplace");
    add(P.labels.harga, Number(o.harga));
    let total = 0;
    for (const x of feeBreakdown(R, o)) { add(x.label, x.nilai); total += x.nilai; }
    const subsidi = subsidiOrder(R, o);
    if (subsidi) add('Subsidi marketplace — ditagih lewat invoice terpisah (PO "-")', subsidi);
    add("TOTAL POTONGAN", total + subsidi);
    add("Dana diterima dari marketplace", Number(o.penghasilan));
    if (e) {
      const selisih = Number(e.invoiceAmount) - Number(e.paymentAmount);
      sec("Kesimpulan");
      add("Selisih ERP", selisih);
      add("Dijelaskan oleh biaya marketplace", total + subsidi);
      add("Tidak terjelaskan", selisih - (total + subsidi));
    }
  } else sec("Pesanan tidak ada di laporan marketplace periode ini");

  return { title: "Rincian Selisih ERP — " + no, rows, cols: DETAIL_COLS, noFoot: true };
}

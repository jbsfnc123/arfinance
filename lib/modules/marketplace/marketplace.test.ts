import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbook, type Report } from "./parse";
import { buildAudit, buildErpRecon, buildRecon, buildReconAdj, erpSubsidi, reconProblems } from "./analysis";

function wb(sheets: Record<string, unknown[][]>) {
  const book = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(aoa), name);
  return book;
}

const PENG_HEAD = ["No. Pesanan", "Lihat berdasarkan", "Harga Produk", "Jumlah Pengembalian Dana ke Pembeli",
  "Total Penghasilan", "Biaya Administrasi (termasuk PPN 11%)", "Diskon Produk dari Shopee", "Tanggal Dana Dilepaskan",
  "ID Produk", "Nama Produk"];

const shopee = wb({
  Summary: [
    ["Username (Penjual)", "penguinstore"], ["Dari", "2026-08-01"], ["ke", "2026-08-31"],
    ["1. Total Pendapatan", "", 250000],
  ],
  Penghasilan: [
    ["Laporan"], PENG_HEAD,
    ["A1", "Order", 100000, 0, 90000, -10000, 5000, "2026-08-05"],
    ["A1", "Sku", 100000, 0, 90000, 0, 0, "", "P-1", "Tangki 500L"],
    ["A2", "Order", 150000, -150000, -3000, -3000, 0, 46240.75],
  ],
  Adjustment: [
    ["Ringkasan Biaya Penyesuaian"], ["Total Penyesuaian", "", -60000], ["No.", "Tanggal Penyesuaian Dibuat",
      "Tipe Penyesuaian | Deskripsi", "Alasan Penyesuaian", "Biaya Penyesuaian", "No. Pesanan Terhubung", "Tanggal Dana Dilepaskan"],
    [1, "2026-08-10", "Refund", "Retur", -60000, "Z9", "2026-07-20"],
    ["Total"],
  ],
});

describe("parse Shopee", () => {
  const res = parseWorkbook(XLSX, shopee);
  const R = res.data as Report;

  it("meta, ringkasan, pesanan vs SKU, tanggal serial berjam diambil tanggalnya", () => {
    expect(res.kind).toBe("report");
    expect(R.meta).toMatchObject({ platform: "shopee", username: "penguinstore", reportId: "shopee_penguinstore_2026-08-01_2026-08-31" });
    expect(R.summary["Total Pendapatan"]).toBe(250000);
    expect(R.Orders.map((o) => o.no)).toEqual(["A1", "A2"]);
    expect(R.Orders[1].tglCair).toBe("2026-08-06");
    expect(R.Items).toEqual([{ no: "A1", idProduk: "P-1", produk: "Tangki 500L", qty: 0, harga: 100000, refund: 0, penghasilan: 90000 }]);
    expect(R.adjustmentSummary["Total Penyesuaian"]).toBe(-60000);
    expect(R.Adjustment).toHaveLength(1); // berhenti di baris "Total"
  });

  it("analisis refund: pesanan periode lain via lookup & refund baris pesanan", () => {
    const withLookup = buildAudit(R, 0, { Z9: { penghasilan: 50000, reportId: "shopee_x_2026-07" } });
    expect(withLookup.find((r) => r.no === "Z9")).toMatchObject({ diterima: 50000, ditarik: 60000, selisih: 10000, status: "Kelebihan potong" });
    expect(buildAudit(R, 0, {}).find((r) => r.no === "Z9")?.status).toBe("Perlu cek manual");
    expect(withLookup.find((r) => r.no === "A2")).toMatchObject({ diterima: 150000, ditarik: 150000, selisih: 3000, status: "Kelebihan potong" });
  });

  it("rekonsiliasi saldo", () => {
    const bal = parseWorkbook(XLSX, wb({
      "Transaction Report": [
        ["Username (Penjual)", "penguinstore"], ["Dari", "2026-08-01"], ["Ke", "2026-08-31"],
        ["Tanggal Transaksi", "Tipe Transaksi", "Deskripsi", "No. Pesanan", "Jenis Transaksi", "Jumlah", "Status", "Saldo Akhir"],
        ["2026-08-06 10:00", "Penghasilan dari Pesanan", "", "A1", "Transaksi Masuk", 89000, "Selesai", 89000],
        ["Tanggal Transaksi", "Tipe Transaksi"],
        ["2026-08-07 10:00", "Penghasilan dari Pesanan", "", "B7", "Transaksi Masuk", 1000, "Selesai", 90000],
        ["2026-08-11 10:00", "Penyesuaian", "Biaya lain", "", "Transaksi Keluar", -500, "Selesai", 89500],
      ],
    }));
    expect(bal.kind).toBe("balance");
    const merged: Report = { ...R, Balance: bal.data.Balance, balanceSummary: bal.data.balanceSummary };
    const recon = buildRecon(merged);
    expect(recon.map((r) => [r.no, r.status])).toEqual([["A1", "Nominal beda"], ["A2", "Belum masuk saldo"], ["B7", "Tanpa pesanan"]]);
    expect(buildReconAdj(merged).map((r) => r.status)).toEqual(["Penyesuaian di luar laporan"]);
    expect(reconProblems(merged)).toHaveLength(4);
  });

  it("rekonsiliasi ERP + invoice subsidi", () => {
    // Baris ERP kini berasal dari RPC mp_erp_rows (bentuk sama dengan parser lama).
    const R2: Report = { ...R, erpMeta: { org: "Penguin", paymentGroup: "Shopee", dari: "2026-08-01", ke: "2026-08-31" }, Erp: [
      { bpName: "Shopee", invoiceNo: "INV-1", invoiceAmount: 100000, paymentAmount: 85000, no: "A1" },
      { bpName: "Shopee", invoiceNo: "INV-2", invoiceAmount: 7000, paymentAmount: 7000, no: "" },
      { bpName: "Shopee", invoiceNo: "INV-3", invoiceAmount: 10, paymentAmount: 0, no: "X1" },
    ] };
    const rows = buildErpRecon(R2, 0);
    // A1: selisih ERP 15.000 = biaya 10.000 + subsidi 5.000 → cocok
    expect(rows.find((r) => r.no === "A1")).toMatchObject({ biaya: 10000, subsidi: 5000, takTerjelaskan: 0, status: "Cocok" });
    expect(rows.find((r) => r.no === "X1")?.status).toBe("Tanpa pesanan di laporan");
    expect(erpSubsidi(R2)).toMatchObject({ erpTotal: 7000, laporan: 5000, selisih: -2000 });
  });
});

describe("parse TikTok", () => {
  it("pesanan, penyesuaian, pembagian produk per qty", () => {
    const res = parseWorkbook(XLSX, wb({
      Laporan: [["Periode", "", "2026/08/01 - 2026/08/31"], ["Nama toko", "", "Penguin Official"], ["Total Pendapatan", "", 300]],
      "Detail pesanan": [
        ["ID Pesanan/Penyesuaian", "Jenis transaksi", "Jumlah penyelesaian pembayaran", "Subtotal setelah diskon penjual",
          "Subtotal pengembalian dana setelah diskon penjual", "Detail produk terjual", "Jumlah penyesuaian", "ID pesanan terkait"],
        ["T1", "Pesanan", 270, 300, 0, "111 * 1; 222 * 2;"],
        ["T2", "Pesanan", -20, 100, -100, "333 * 1"],
        ["ADJ1", "Penyesuaian", 0, 0, 0, "", -15, "T1"],
      ],
    }));
    const R = res.data as Report;
    expect(R.meta).toMatchObject({ platform: "tiktok", username: "Penguin Official", dari: "2026-08-01", ke: "2026-08-31" });
    expect(R.Orders.map((o) => o.no)).toEqual(["T1", "T2"]);
    expect(R.Items.filter((i) => i.no === "T1").map((i) => [i.idProduk, i.qty, i.penghasilan])).toEqual([["111", 1, 90], ["222", 2, 180]]);
    expect(R.Adjustment).toEqual([expect.objectContaining({ no: "T1", nilai: -15 })]);
    // T2: refund penuh tetapi dana akhir negatif → biaya tidak dikembalikan
    expect(buildAudit(R, 0, {}).find((r) => r.no === "T2")).toMatchObject({ status: "Biaya tidak dikembalikan", selisih: 20 });
  });
});

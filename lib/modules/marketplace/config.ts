// Konfigurasi platform, di-port dari MarketPlace/index.html (SHOPEE_COLS, TIKTOK_FEES, PLATFORMS).

export type Platform = "shopee" | "tiktok";
export type Group = { label: string; keys: string[]; summary?: string };

export const SHOPEE_COLS: Record<string, string> = {
  no: "No. Pesanan", tglPesan: "Waktu Pesanan Dibuat", tglCair: "Tanggal Dana Dilepaskan",
  metodeCair: "Metode Pelepasan Dana", tipe: "Tipe Pesanan", penghasilan: "Total Penghasilan",
  harga: "Harga Produk", refund: "Jumlah Pengembalian Dana ke Pembeli",
  ongkirPembeli: "Ongkir Dibayar Pembeli", ongkirJasa: "Ongkos Kirim yang Dibayarkan ke Jasa Kirim",
  potOngkirJasa: "Potongan Ongkos Kirim dari Jasa Kirim", gratisOngkir: "Gratis Ongkir dari Shopee",
  ongkirRetur: "Ongkos Kirim Pengembalian Barang", rtsFee: "Return to Seller Fee",
  pengembalianOngkir: "Pengembalian Biaya Kirim",
  voucherPenjual: "Voucher disponsor oleh Penjual", cashbackPenjual: "Cashback Koin disponsori Penjual",
  diskonShopee: "Diskon Produk dari Shopee", voucherCofund: "Voucher co-fund disponsor oleh Penjual",
  cashbackCofund: "Cashback Koin Co-fund disponsori Penjual",
  admin: "Biaya Administrasi (termasuk PPN 11%)", proses: "Biaya Proses Pesanan", bayar: "Biaya Pembayaran",
  transaksi: "Biaya Transaksi", kampanye: "Biaya Kampanye", ams: "Biaya Komisi AMS",
  isiSaldo: "Biaya Isi Saldo Otomatis (dari Penghasilan)", premi: "Premi", fbs: "FBS Fee",
  preorder: "Biaya Layanan Pre-Order Non-Shopee Video", pph22: "PPh 22",
  pembeli: "Username (Pembeli)", dibayarPembeli: "Jumlah Dibayar Pembeli",
  metodeBayar: "Metode pembayaran pembeli", cicilan: "Rencana Cicilan (jika berlaku)",
  jasaKirim: "Jasa Kirim", kurir: "Nama Kurir", voucher: "Kode Voucher",
};

export const SHOPEE_GROUPS: Record<string, Group> = {
  voucher: { label: "Voucher & Subsidi", keys: ["voucherPenjual", "cashbackPenjual", "diskonShopee", "voucherCofund", "cashbackCofund"], summary: "Voucher & Subsidi" },
  kirim: { label: "Biaya Pengiriman", keys: ["ongkirPembeli", "ongkirJasa", "potOngkirJasa", "gratisOngkir", "ongkirRetur", "rtsFee", "pengembalianOngkir"], summary: "Total Biaya Pengiriman" },
  platform: { label: "Biaya Platform", keys: ["admin", "proses", "bayar", "transaksi"], summary: "Biaya Platform" },
  promosi: { label: "Biaya Promosi", keys: ["kampanye", "ams", "isiSaldo"], summary: "Biaya Promosi" },
  lainnya: { label: "Biaya Lainnya", keys: ["premi", "fbs", "preorder"], summary: "Biaya Lainnya" },
  pajak: { label: "Pajak", keys: ["pph22"], summary: "Pajak" },
};

// [key, judul kolom di sheet "Detail pesanan", kelompok biaya]
export const TIKTOK_FEES: [string, string, string][] = [
  ["komisiPlatform", "Biaya komisi platform", "platform"],
  ["layananPreorder", "Biaya layanan pre-order", "platform"],
  ["layananMall", "Biaya layanan Mall", "platform"],
  ["biayaBayar", "Biaya Pembayaran", "platform"],
  ["ccInstallment", "Credit card installment - Handling fee", "platform"],
  ["prosesPesanan", "Biaya pemrosesan pesanan", "platform"],
  ["layananKhususPlatform", "Biaya layanan khusus platform", "platform"],
  ["dilayaniTokopedia", "Biaya Dilayani Tokopedia", "platform"],
  ["penangananTokopedia", "Biaya penanganan Dilayani Tokopedia", "platform"],
  ["payLater", "Biaya program PayLater", "platform"],
  ["penginstalan", "Biaya layanan penginstalan", "platform"],
  ["terkelolaPerPesanan", "Program layanan terkelola (Biaya per pesanan)", "platform"],
  ["aksesEksklusif", "Biaya akses keuntungan eksklusif", "platform"],
  ["khususLive", "Biaya layanan Khusus LIVE", "platform"],
  ["eams", "Biaya layanan Program EAMS", "platform"],
  ["crazyDeal", "Biaya layanan Brands Crazy Deal/Flash Sale", "platform"],
  ["komisiAfiliasi", "Komisi Afiliasi", "afiliasi"],
  ["komisiMitra", "Komisi mitra afiliasi", "afiliasi"],
  ["iklanTokoAfiliasi", "Komisi Iklan Toko afiliasi", "afiliasi"],
  ["depositAfiliasi", "Deposit komisi afiliasi", "afiliasi"],
  ["refundAfiliasi", "Pengembalian dana komisi afiliasi", "afiliasi"],
  ["iklanTokoMitra", "Komisi iklan toko Mitra Afiliasi", "afiliasi"],
  ["komisiDinamis", "Komisi dinamis", "afiliasi"],
  ["cashbackBonus", "Biaya layanan cashback bonus", "promosi"],
  ["gmvMaxIklan", "Biaya iklan GMV Max", "promosi"],
  ["gmvMaxVoucher", "Voucher GMV Max", "promosi"],
  ["campaign", "Biaya sumber daya campaign", "promosi"],
  ["bebasOngkir", "Biaya layanan Program Bebas Ongkir", "promosi"],
  ["ongkir", "Ongkir", "info"], // subtotal kolom ongkir di bawahnya — tidak ikut dijumlahkan
  ["ongkirTalangan", "Ongkir yang ditalangi penyedia jasa logistik", "kirim"],
  ["ongkirGanti", "Ongkir penggantian (ditanggung pembeli)", "kirim"],
  ["ongkirTukar", "Ongkir penukaran (ditanggung pembeli)", "kirim"],
  ["ongkirPlatform", "Ongkir yang ditanggung platform", "kirim"],
  ["ongkirPembeli", "Ongkir yang ditanggung pembeli", "kirim"],
  ["ongkirRefund", "Pengembalian ongkir yang dibayar pembeli", "kirim"],
  ["ongkirRetur", "Ongkir pengembalian barang (yang ditanggung pembeli)", "kirim"],
  ["subsidiOngkir", "Subsidi ongkir", "kirim"],
  ["ongkirHorison", "Biaya pengiriman sesuai jarak dari Program Horison+", "kirim"],
  ["layananLogistik", "Biaya layanan logistik", "kirim"],
  ["ongkirGagalKirim", "Ongkir pesanan gagal kirim", "kirim"],
  ["ongkirSalahPembeli", "Ongkir pengembalian barang karena kesalahan pembeli", "kirim"],
  ["pph22", "PPh Pasal 22 dipungut", "pajak"],
  ["pajakGmvMax", "Pajak penjualan atas voucher GMV Max", "pajak"],
  ["terkelolaPajak", "Program layanan terkelola (Pajak penjualan)", "pajak"],
  ["gantiAsuransi", "Penggantian dana asuransi", "lainnya"],
  ["biayaAsuransi", "Biaya asuransi", "lainnya"],
];

export const TIKTOK_COLS: Record<string, string> = {
  no: "ID Pesanan/Penyesuaian", tipe: "Jenis transaksi", tglPesan: "Waktu pemesanan",
  tglCair: "Waktu pembayaran pesanan", mataUang: "Mata uang",
  penghasilan: "Jumlah penyelesaian pembayaran", pendapatan: "Total Pendapatan",
  harga: "Subtotal setelah diskon penjual", hargaSebelumDiskon: "Subtotal sebelum diskon",
  diskonPenjual: "Diskon penjual", horisonProduk: "Biaya produk sesuai jarak dari Program Horison+",
  refund: "Subtotal pengembalian dana setelah diskon penjual",
  refundSebelumDiskon: "Subtotal pengembalian dana sebelum diskon penjual",
  refundDiskonPenjual: "Pengembalian dana diskon penjual", totalBiaya: "Total Biaya",
  penyesuaian: "Jumlah penyesuaian", noTerkait: "ID pesanan terkait",
  dibayarPembeli: "Pembayaran oleh pembeli", refundPembeli: "Pengembalian dana pembeli",
  beratPaket: "Berat paket yang bisa dikenai biaya", produkDetail: "Detail produk terjual",
  metodeBayar: "Sumber pesanan",
  ...Object.fromEntries(TIKTOK_FEES.map(([k, title]) => [k, title])),
};

const TIKTOK_GROUP_LABEL: Record<string, string> = {
  platform: "Komisi & Platform", afiliasi: "Afiliasi", promosi: "Promosi", kirim: "Pengiriman", pajak: "Pajak", lainnya: "Lainnya",
};
export const TIKTOK_GROUPS: Record<string, Group> = Object.fromEntries(
  Object.keys(TIKTOK_GROUP_LABEL).map((g) => [g, { label: TIKTOK_GROUP_LABEL[g], keys: TIKTOK_FEES.filter((f) => f[2] === g).map((f) => f[0]) }]),
);

export type PlatformConfig = {
  label: string;
  cols: Record<string, string>;
  groups: Record<string, Group>;
  sum: Record<"pendapatan" | "pengeluaran" | "dilepas" | "harga" | "refund", string>;
  labels: { dilepas: string; harga: string; dist1: string; dist2: string; dist2Key: string };
  feeGroups: string[];
  subsidiKey: string | null; // subsidi marketplace yang ditagih lewat invoice terpisah (PO "-")
};

export const PLATFORMS: Record<Platform, PlatformConfig> = {
  shopee: {
    label: "Shopee", cols: SHOPEE_COLS, groups: SHOPEE_GROUPS,
    sum: { pendapatan: "Total Pendapatan", pengeluaran: "Total Pengeluaran", dilepas: "Total yang Dilepas",
      harga: "Harga Asli Produk", refund: "Jumlah Pengembalian Dana ke Pembeli" },
    labels: { dilepas: "Total Dana Dilepas", harga: "Harga Produk", dist1: "Metode Pembayaran", dist2: "Jasa Kirim", dist2Key: "jasaKirim" },
    feeGroups: ["platform", "promosi", "kirim", "lainnya", "pajak"],
    subsidiKey: "diskonShopee",
  },
  tiktok: {
    label: "TikTok", cols: TIKTOK_COLS, groups: TIKTOK_GROUPS,
    sum: { pendapatan: "Total Pendapatan", pengeluaran: "Total Biaya", dilepas: "Jumlah penyelesaian pembayaran",
      harga: "Subtotal setelah diskon penjual", refund: "Subtotal pengembalian dana setelah diskon penjual" },
    labels: { dilepas: "Dana Diselesaikan", harga: "Subtotal Produk", dist1: "Sumber Pesanan", dist2: "Status Refund", dist2Key: "statusRefund" },
    feeGroups: ["platform", "afiliasi", "promosi", "kirim", "pajak", "lainnya"],
    subsidiKey: null,
  },
};

// Kolom yang disimpan sebagai teks (selain itu angka).
export const TEXT_KEYS = new Set(["no", "tglPesan", "tglCair", "metodeCair", "tipe", "pembeli", "metodeBayar",
  "cicilan", "jasaKirim", "kurir", "voucher", "idProduk", "produk", "tanggal", "cairLama", "deskripsi",
  "alasan", "pesanan", "noTerkait", "produkDetail", "mataUang", "jenis", "refId", "status", "rekening",
  "tglMinta", "tglSukses", "sumber", "platform", "keterangan", "waktu", "arah", "kas",
  "invoiceNo", "invoiceDate", "paymentDoc", "paymentDate", "bpName", "lokasi", "cabang"]);

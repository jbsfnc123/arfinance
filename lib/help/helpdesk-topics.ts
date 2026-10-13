// Basis pengetahuan mode terpandu AR Helpdesk (Fase 67): tombol pilihan yang dijawab langsung tanpa AI.
// Topik halaman "Halaman ini untuk apa?" & "Penjelasan lengkap" dibangkitkan dari MENU_HELP; sisanya ditulis tangan.
// Diekspor ke Apps Script oleh scripts/export-menu-help.mjs (Topics.js) bersama mesinnya (helpdesk-engine.ts).
// Tanpa import runtime agar bisa dimuat langsung oleh Node (scripts/export-menu-help.mjs); digabung di ./topics.ts.
import type { HelpTopic } from "./helpdesk-engine";
import type { MenuHelp } from "./menu-help";

const P = {
  dashColl: "/dashboard/collection", dashTukar: "/dashboard/tukar-faktur", mutasi: "/mutasi-bank", presentasi: "/presentasi",
  coll: "/collection", collCase: "/collection/case", payhist: "/collection/history-pembayaran",
  jadwal: "/tukar-faktur/jadwal", kurir: "/tukar-faktur/kurir", ekspedisi: "/tukar-faktur/ekspedisi", tfUpload: "/tukar-faktur/upload",
  m10: "/mitra10", rkm: "/rkm", msj: "/monitor-surat-jalan",
  pengajuan: "/faktur/pengajuan", fakturList: "/faktur/list", ltkp: "/faktur/ltkp", coretax: "/coretax",
  komisi: "/billing/komisi", email: "/billing/email-customer", cekHarga: "/cek-harga", marketplace: "/marketplace",
  pdf: "/tools/pdf-editor", upload: "/pengaturan/upload", target: "/pengaturan/target", arsip: "/pengaturan/arsip",
  wa: "/pengaturan/wa-template", home: "/", akun: "/akun", acl: "/acl", database: "/database", ai: "/ai-settings",
} as const;

export const HAND_TOPICS: HelpTopic[] = [
  // ── Umum ────────────────────────────────────────────────────────────────────────────────────────────────────
  { id: "update-data", kind: "general", q: "Bagaimana cara update data?", keys: ["upload", "data", "laporan", "erp", "terbaru", "refresh"],
    pages: [P.home, P.upload, P.coll, P.dashColl, P.payhist, P.mutasi, P.msj],
    related: ["aging", "ar-bot", "data-kosong"],
    a: "Data utama di-upload **sekali** lewat **Pengaturan › Pusat Upload Data**, lalu langsung dipakai semua menu terkait. Upload ulang file yang sama tidak membuat data dobel.\n" +
      "File yang diterima: **Aging (Blank_A4)**, **Invoice & Payment Date Comparison**, **Target bulanan**, dan **Mutasi rekening**, boleh beberapa file sekaligus.\n" +
      "Sebagian data sudah di-upload otomatis oleh **AR Bot** setiap hari kerja (Aging, jadwal kurir, serah terima SJ).\n" +
      "Setelah upload, tekan tombol **Refresh** di bar atas bila angka belum berubah." },
  { id: "data-kosong", kind: "general", q: "Kenapa data atau angka kosong?", keys: ["kosong", "nol", "tidak", "muncul", "data", "angka", "blank"],
    pages: [P.dashColl, P.coll, P.msj, P.mutasi, P.payhist, P.m10, P.rkm],
    related: ["update-data", "arsip-lama", "akses"],
    a: "Penyebab paling umum:\n" +
      "1. **Data belum di-upload** untuk periode itu — cek **Pengaturan › Pusat Upload Data** (checklist harian).\n" +
      "2. **Filter atau kata cari** terlalu sempit — hapus filter lalu coba lagi.\n" +
      "3. **Bulan lama sudah diarsip** — datanya otomatis dimuat dari arsip (tertulis \"dari arsip\"); tunggu sebentar.\n" +
      "4. **Periode belum benar** — samakan bulan/periode yang dipilih dengan data yang di-upload." },
  { id: "akses", kind: "general", q: "Kenapa menu terkunci / tidak bisa dibuka?", keys: ["akses", "titik", "merah", "menu", "role", "admin"],
    pages: [P.home, P.akun, P.acl], related: ["cari-menu"],
    a: "Menu dengan **titik merah** belum diberikan untuk akun Anda. Akses menu diatur oleh **Super Admin** (Akun & PIN › Akses menu).\n" +
      "Hubungi Super Admin bila butuh akses — chatbot tidak bisa memberikan atau mengubah akses." },
  { id: "cari-menu", kind: "general", q: "Bagaimana mencari menu atau invoice?", keys: ["cari", "menu", "invoice", "aplikasi", "ctrl", "pencarian", "navigasi"],
    pages: [P.home], related: ["akses"],
    a: "**Komputer:** tekan **Ctrl + K** (atau tombol Cari di bar atas) untuk mencari menu, Business Partner, atau nomor invoice.\n" +
      "**HP:** ketuk/geser ke atas tombol **^** di tengah bawah layar → deretan menu muncul → pilih grup atau **Cari aplikasi**." },
  { id: "arsip-lama", kind: "general", q: "Di mana data bulan-bulan lama?", keys: ["arsip", "lama", "bulan", "drive", "histori", "history"],
    pages: [P.arsip, P.database, P.payhist, P.mutasi], related: ["data-kosong"],
    a: "Data historis dipindah dari database ke **arsip Google Drive** agar aplikasi tetap ringan. Anda tidak perlu melakukan apa-apa: **History Pembayaran, Mutasi Bank, KPI & Email Customer** otomatis memuat bulan lama dari arsip.\n" +
      "Untuk melihat/mengunduh isi arsip secara langsung buka **Pengaturan › Arsip Data**." },
  { id: "ar-bot", kind: "general", q: "Apa itu AR Bot?", keys: ["bot", "otomatis", "otomasi", "download", "jaspersoft", "edi", "jadwal"],
    pages: [P.upload, P.tfUpload, P.msj, P.m10], related: ["update-data"],
    a: "**AR Bot** adalah aplikasi di PC tim AR yang mengunduh laporan ERP (Jaspersoft) dan portal EDI Mitra10 secara otomatis, lalu mengirimkannya ke AR Workspace.\n" +
      "Jadwal default: hari kerja pukul 10.00 — Aging, jadwal kurir, serah terima SJ, GR Report & Kwitansi Mitra10. Bila data hari ini belum masuk, upload manual lewat Pusat Upload Data." },
  { id: "lupakan", kind: "general", q: "Bagaimana menghapus memori chat?", keys: ["memori", "lupakan", "hapus", "chat", "riwayat"],
    a: "Ketik **lupakan saya** atau pilih menu ⋯ › **Lupakan saya**. Untuk sekadar membersihkan layar, pilih ⋯ › **Bersihkan chat**." },

  // ── Istilah ─────────────────────────────────────────────────────────────────────────────────────────────────
  { id: "gr", kind: "term", q: "Apa maksud GR?", keys: ["gr", "goods", "receipt", "receiving", "terima", "barang"],
    pages: [P.m10, P.rkm], related: ["siap-tf", "kwitansi", "m10-update"],
    a: "**GR (Goods Receipt / Receiving)** = bukti customer sudah **menerima barang**. Di Mitra10 datanya dari **GR_Report_Detail.csv** (portal EDI), di RKM dari Excel **GRPO**.\n" +
      "GR berstatus **Done** berarti barang sudah diterima dan invoice siap ditukar faktur." },
  { id: "kwitansi", kind: "term", q: "Apa maksud Kwitansi?", keys: ["kwitansi", "kw", "invoice", "summary", "tukar"],
    pages: [P.m10, P.rkm], related: ["gr", "tukar-faktur"],
    a: "**Kwitansi (KW)** = dokumen tagihan yang sudah dibuat di portal customer dari invoice kita. Di Mitra10 dari **Invoice_Summary.csv**; SJ yang sudah ada di Kwitansi berarti **Tukar Faktur Done**." },
  { id: "siap-tf", kind: "term", q: "Apa arti status Siap TF?", keys: ["siap", "tf", "status", "pending", "done"],
    pages: [P.m10], related: ["gr", "tukar-faktur"],
    a: "**Siap TF** = **GR sudah Done**, tetapi **Tukar Faktur masih Pending**. Invoice ini sudah bisa ditukar fakturkan." },
  { id: "aging", kind: "term", q: "Apa itu Aging?", keys: ["aging", "blank", "a4", "piutang", "outstanding", "umur"],
    pages: [P.coll, P.dashColl, P.upload, P.m10, P.rkm, P.msj], related: ["update-data", "closing"],
    a: "**Aging** (file **MASTER AGING / Blank_A4** dari ERP) = daftar piutang yang **belum lunas** beserta umurnya. Upload terbaru menjadi data aktif; invoice yang tidak ada lagi di Aging terbaru dianggap sudah keluar dari tagihan aktif.\n" +
      "Keterangan, jadwal bayar & catatan manual tetap tersimpan." },
  { id: "sj", kind: "term", q: "Apa itu SJ / Surat Jalan?", keys: ["sj", "surat", "jalan", "pengiriman", "receiver"],
    pages: [P.msj, P.rkm, P.m10], related: ["gr", "msj-update"],
    a: "**SJ (Surat Jalan)** = dokumen pengiriman barang. Satu invoice bisa punya beberapa SJ. Monitor Surat Jalan menghitung kapan SJ diterima (Receive Date) oleh Receiver yang diakui." },
  { id: "tukar-faktur", kind: "term", q: "Apa itu Tukar Faktur?", keys: ["tukar", "faktur", "tf", "kolektor", "ekspedisi"],
    pages: [P.dashTukar, P.jadwal, P.kurir, P.ekspedisi, P.m10, P.rkm], related: ["siap-tf", "kwitansi"],
    a: "**Tukar Faktur** = menyerahkan invoice + faktur pajak + dokumen pendukung ke customer agar tagihan bisa diproses bayar. Bisa lewat **kolektor** (Aplikasi Kolektor), **ekspedisi** (No Resi), atau **portal** (Mitra10/RKM)." },
  { id: "ltkp", kind: "term", q: "Apa itu LTKP?", keys: ["ltkp", "koreksi", "pencegahan"],
    pages: [P.ltkp, P.fakturList, P.pengajuan],
    a: "**LTKP** = **Laporan Tindakan Koreksi & Pencegahan** yang dibuat dari pengajuan pembatalan/revisi faktur pajak." },
  { id: "cbd-top", kind: "term", q: "Apa beda CBD dan TOP?", keys: ["cbd", "top", "tempo", "prepaid", "cash"],
    pages: [P.email, P.payhist],
    a: "**CBD (Cash Before Delivery)** = customer membayar sebelum barang dikirim. **TOP (Term of Payment)** = customer membayar setelah tempo (mis. Net 30 Days)." },
  { id: "dpp-pph", kind: "term", q: "Apa itu DPP dan PPh?", keys: ["dpp", "pph", "pajak", "potongan", "21", "23"],
    pages: [P.komisi], related: ["komisi-hitung"],
    a: "**DPP (Dasar Pengenaan Pajak)** = nilai yang dikenai tarif pajak. **PPh** = pajak penghasilan yang dipotong. Untuk komisi orang pribadi, DPP = 50% × komisi bruto (PPh 21); untuk badan, PPh 23 = 2% × komisi bruto." },
  { id: "closing", kind: "term", q: "Apa arti Closing Bulan?", keys: ["closing", "kunci", "snapshot", "tutup", "bulan"],
    pages: [P.dashColl], related: ["target", "aging"],
    a: "**Closing Bulan** mengunci angka Dashboard Collection bulan itu (snapshot). Setelah closing, upload Aging baru **tidak mengubah** angka bulan tersebut; revisi tercatat di Riwayat Closing." },
  { id: "target", kind: "term", q: "Apa itu Target Collection?", keys: ["target", "open", "amt", "terkumpul", "pencapaian"],
    pages: [P.dashColl, P.target, P.mutasi], related: ["target-upload", "allocated"],
    a: "**Target** = daftar invoice (Open Amt) yang harus tertagih pada bulan itu. **Sudah Terkumpul** = target − sisa di Aging. Target di-upload sekali per bulan di **Pengaturan › Upload Target Bulanan**." },
  { id: "allocated", kind: "term", q: "Apa arti Allocated dan Allocated in Target?", keys: ["allocated", "alokasi", "payment", "pembayaran", "realisasi"],
    pages: [P.mutasi, P.dashColl], related: ["target", "mutasi-upload"],
    a: "**Allocated** = pembayaran ERP yang sudah dialokasikan ke invoice pada bulan itu. **Allocated in Target** = bagian yang masuk ke invoice **target** bulan itu. Selisih dengan uang masuk = dana yang belum/tidak dialokasikan ke target." },
  { id: "jadwal-bayar", kind: "term", q: "Apa itu Jadwal Bayar?", keys: ["jadwal", "bayar", "rencana", "transfer", "promise"],
    pages: [P.coll, P.dashColl, P.m10],
    a: "**Jadwal Bayar** = tanggal rencana bayar per invoice. Satu field yang sama dipakai Daftar Tagihan, Jadwal Bayar Mitra10 & Dashboard Collection — nilai terakhir yang diisi yang berlaku." },

  // ── Khusus halaman ──────────────────────────────────────────────────────────────────────────────────────────
  { id: "m10-update", kind: "page", q: "Bagaimana cara update data Mitra10?", keys: ["upload", "mitra10", "mitra", "aging", "receiving", "kwitansi", "jadwal", "data"],
    pages: [P.m10], related: ["gr", "kwitansi", "siap-tf"],
    a: "Ada 4 upload di halaman Mitra10:\n" +
      "1. **Aging** — Blank_A4 (cukup sekali, di sini atau Pusat Upload).\n" +
      "2. **Receiving** — GR_Report_Detail.csv (pemisah \";\").\n" +
      "3. **Kwitansi** — Invoice_Summary.csv.\n" +
      "4. **Jadwal Bayar** — Excel NO KW, SPP, NILAI KW, TGL TUKAR FAKTUR, JADWAL TRANSFER.\n" +
      "GR & Kwitansi juga dikirim otomatis oleh **AR Bot**." },
  { id: "rkm-update", kind: "page", q: "Bagaimana cara update data RKM?", keys: ["upload", "rkm", "receiving", "grpo", "kwitansi", "data"],
    pages: [P.rkm], related: ["gr", "kwitansi"],
    a: "Upload **Aging** (Blank_A4), lalu **Receiving** & **Kwitansi** berupa Excel dari portal RKM. Receiving & Kwitansi **mengganti seluruh isi** sebelumnya, jadi selalu upload file terlengkap." },
  { id: "msj-update", kind: "page", q: "Bagaimana cara update Monitor Surat Jalan?", keys: ["upload", "serah", "terima", "csv", "receiver", "data"],
    pages: [P.msj], related: ["sj", "ar-bot"],
    a: "Upload CSV **LaporanSerahTerimaSuratJalan** (pemisah koma). Hanya SJ yang ada di Aging terbaru yang disimpan, dan Receive Date lama tidak ditimpa. **AR Bot** meng-upload laporan 7 hari terakhir setiap hari kerja." },
  { id: "msj-receiver", kind: "page", q: "Kenapa SJ masih \"Belum diterima\"?", keys: ["belum", "diterima", "receiver", "status", "sj"],
    pages: [P.msj], related: ["msj-update"],
    a: "SJ dianggap diterima hanya bila Receiver-nya ada di **daftar Receiver aktif**. Cek daftar Receiver di halaman ini, atau pastikan laporan serah terima terbaru sudah di-upload." },
  { id: "mutasi-upload", kind: "page", q: "Bagaimana upload mutasi rekening?", keys: ["upload", "mutasi", "rekening", "bank", "sheet", "data"],
    pages: [P.mutasi], related: ["allocated", "update-data"],
    a: "Upload file mutasi (boleh beberapa file & sheet). Rekening dikenali dari **4 digit terakhir**; hanya baris **CR** yang disimpan; tanggal yang tercakup file akan diganti. Pembayaran ERP diambil dari upload **Invoice & Payment** di Pusat Upload." },
  { id: "target-upload", kind: "page", q: "Bagaimana upload target bulanan?", keys: ["upload", "target", "bulanan", "open", "amt", "data"],
    pages: [P.target, P.dashColl], related: ["target", "closing"],
    a: "Buka **Pengaturan › Upload Target Bulanan**, pilih bulan, lalu upload Excel berkolom **Invoice No** dan **Target/Open Amt**. Upload ulang untuk bulan yang sama mengganti target bulan itu." },
  { id: "tf-jadwal-upload", kind: "page", q: "Bagaimana upload jadwal kurir?", keys: ["upload", "jadwal", "kurir", "master", "kirim", "data"],
    pages: [P.tfUpload, P.jadwal], related: ["ar-bot"],
    a: "Upload **Data Master Kirim (.csv)**; Data Aging opsional. Jadwal diganti seluruhnya setiap upload, tetapi hasil kunjungan kurir yang sudah tercatat tidak terhapus. AR Bot meng-upload otomatis setiap hari kerja." },
  { id: "komisi-hitung", kind: "page", q: "Bagaimana PPh komisi dihitung?", keys: ["komisi", "pph", "progresif", "lapisan", "tarif", "hitung"],
    pages: [P.komisi], related: ["dpp-pph"],
    a: "**Orang Pribadi (PPh 21):** DPP = 50% × komisi, lalu tarif progresif Pasal 17 (5% s/d 60 jt, 15% s/d 250 jt, 25% s/d 500 jt, 30% s/d 5 M, 35% di atasnya) dihitung dari **akumulasi** semua transaksi.\n" +
      "**Badan (PPh 23):** 2% × komisi.\nKalkulator ini tidak menyimpan data." },
  { id: "email-centang", kind: "page", q: "Apa arti tanda ✓ kuning/hijau?", keys: ["centang", "kuning", "hijau", "email", "kirim", "status"],
    pages: [P.email], related: ["cbd-top"],
    a: "**✓ kuning** = ada penjualan minggu itu, email belum dikirim. Klik → **✓ hijau** = email sudah dikirim (klik lagi untuk batal). **✗** = tidak ada penjualan." },
  { id: "pdf-kompres", kind: "page", q: "Apa beda kompres Aman dan Kuat?", keys: ["kompres", "aman", "kuat", "ukuran", "kecil", "pdf"],
    pages: [P.pdf],
    a: "**Aman** = PDF disimpan ulang (0–25% lebih kecil, teks tetap bisa dipilih). **Kuat** = setiap halaman jadi gambar (jauh lebih kecil, teks tidak bisa dipilih). Semua diproses di browser, file tidak dikirim ke server." },
  { id: "coll-wa", kind: "page", q: "Bagaimana kirim tagihan lewat WA?", keys: ["wa", "whatsapp", "pesan", "kirim", "tagihan", "template"],
    pages: [P.coll, P.wa],
    a: "Di Daftar Tagihan pilih collection, lalu gunakan tombol WA. Ubah isi pesan lewat **Edit Pesan WA** (tersimpan di perangkat ini) atau template bawaan di **Pengaturan › Template WA**. Placeholder: {{collection}}, {{total}}." },
];

/** Topik otomatis per halaman dari MENU_HELP: fungsi halaman & penjelasan lengkap. */
export const pageTopics = (help: MenuHelp[]): HelpTopic[] => help.flatMap((h) => {
  const name = h.menu.startsWith("/") ? h.href : h.menu.split("›").pop()!.trim();
  const keys = name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  return [
    { id: `${h.href}#fungsi`, kind: "page" as const, q: "Halaman ini untuk apa?", keys: [...keys, "fungsi", "kegunaan", "guna"], pages: [h.href],
      related: [`${h.href}#detail`], a: h.text[0] },
    { id: `${h.href}#detail`, kind: "page" as const, q: `Penjelasan lengkap ${name}`, keys: [...keys, "penjelasan", "lengkap", "detail", "aturan"],
      pages: [h.href], a: h.text.map((t) => `• ${t}`).join("\n") },
  ];
});

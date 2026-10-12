// Data chat terarah AR Helpdesk (Fase 67): pertanyaan & jawaban template per menu. Tanpa import agar bisa diekspor
// ke Apps Script oleh scripts/export-menu-help.mjs. Mesin pencocokan ada di guided-chat.ts.
// Gaya jawaban: singkat, jelas, padat, ramah santai ("Kak"), tanpa pantun. Maks. 5 poin, ≤200 karakter per poin.

export type Topic = {
  id: string;
  /** Label tombol pilihan (pertanyaan user). */
  q: string;
  /** Jawaban: tiap item satu baris/langkah singkat. */
  a: string[];
  /** Kata kunci tambahan untuk pencarian "Hal lainnya". */
  k?: string;
  /** Pertanyaan lanjutan yang disarankan setelah jawaban. */
  next?: string[];
  /** Tombol "Buka menu" ke halaman terkait. */
  go?: string;
};

// ── Topik umum (muncul di semua menu) ────────────────────────────────────────────────────────────────────────────
export const GENERAL_TOPICS: Topic[] = [
  { id: "umum.upload", q: "Cara upload data terbaru", k: "update aging erp import file excel", go: "/pengaturan/upload", a: [
    "Buka **Pengaturan › Pusat Upload Data**.",
    "Pilih/seret file ERP: Aging (Blank_A4), Invoice & Payment Date Comparison, Target bulanan, atau Mutasi rekening. Boleh banyak file sekaligus.",
    "Data langsung dipakai semua menu terkait. Upload ulang file yang sama tidak bikin data dobel.",
    "Aging, jadwal kolektor & serah terima SJ juga di-upload otomatis oleh Bot ERP tiap hari kerja.",
  ], next: ["umum.kosong", "umum.refresh"] },
  { id: "umum.kosong", q: "Datanya kosong / tidak muncul", k: "blank belum ada data tidak tampil hilang", a: [
    "Cek dulu filter & kata cari — coba hapus semua filter.",
    "Pastikan data sumbernya sudah di-upload (umumnya Aging terbaru di Pusat Upload Data).",
    "Klik tombol **Refresh data** di bilah atas agar data terbaru terbaca.",
    "Masih kosong? Kemungkinan periode/bulan yang dipilih memang belum ada datanya.",
  ], next: ["umum.upload", "umum.refresh"] },
  { id: "umum.refresh", q: "Data belum ter-update", k: "terbaru lama refresh muat ulang cache sinkron", a: [
    "Klik **Refresh data** di bilah atas (data disimpan sementara di browser supaya cepat).",
    "Lihat keterangan \"Data per\" — itu waktu Aging terakhir di-upload.",
    "Kalau masih lama, upload ulang Aging terbaru di Pusat Upload Data.",
  ], next: ["umum.upload"] },
  { id: "umum.filter", q: "Cara pakai filter & pencarian", k: "cari search saring kolom urut sort excel unduh", a: [
    "Ketik di kotak **Cari…** untuk mencari di semua kolom (invoice, BP, catatan, dll).",
    "Pakai dropdown filter (mis. Collection, BP, Payment Group, bulan) untuk mempersempit data.",
    "Klik judul kolom untuk mengurutkan. Tombol Excel mengunduh data sesuai filter yang aktif.",
  ] },
  { id: "umum.akses", q: "Menu terkunci / tidak punya akses", k: "lock gembok titik merah izin role denied", a: [
    "Menu bertitik merah = akun Kakak belum diberi akses.",
    "Akses diatur per akun oleh Super Admin di **Finance › Akun & PIN** (tombol Akses menu).",
    "Setelah akses diubah, keluar lalu masuk lagi atau muat ulang halaman.",
  ] },
  { id: "umum.pin", q: "Lupa / ganti PIN & foto profil", k: "login password masuk reset akun profil", a: [
    "Ganti PIN & foto profil: klik avatar/nama di kanan atas → menu akun.",
    "Lupa PIN: minta Super Admin klik **Reset PIN** di Akun & PIN, lalu buat PIN baru saat masuk.",
    "PIN 6 digit dan tidak pernah ditampilkan ulang.",
  ] },
  { id: "umum.menu", q: "Fungsi menu ini apa?", a: [] }, // diisi dari MENU_HELP sesuai halaman aktif
];

// ── Topik per menu ───────────────────────────────────────────────────────────────────────────────────────────────
export const MENU_TOPICS: Record<string, Topic[]> = {
  "/": [
    { id: "home.notes", q: "Cara pakai Beranda", k: "sticky notes catatan papan", a: [
      "Beranda berisi papan sticky notes bersama untuk pengingat kerja tim.",
      "Menu lain dibuka dari sidebar, dock bawah, atau tombol cari di bilah atas.",
    ] },
    { id: "home.ws", q: "Pindah ke workspace lain", k: "portal ap finance kolektor", a: [
      "Klik **Portal** (tangki.space) untuk memilih AR Workspace, AP Workspace, atau Aplikasi Kolektor.",
      "Login berlaku di semua workspace, tidak perlu masuk ulang.",
    ] },
  ],
  "/dashboard/collection": [
    { id: "dc.angka", q: "Arti angka-angka di dashboard", k: "target terkumpul outstanding jadwal bayar kpi", a: [
      "**Total Target** = target bulan terpilih.",
      "**Sudah Terkumpul** = target − sisa di Aging.",
      "**Sisa Outstanding** = invoice target yang belum lunas.",
      "**Jadwal Bayar** = invoice target yang sudah punya rencana bayar.",
    ], next: ["dc.rekon", "dc.closing"] },
    { id: "dc.kosong", q: "Dashboard kosong / target 0", k: "belum ada target", go: "/pengaturan/target", a: [
      "Upload target bulan itu di **Pengaturan › Upload Target Bulanan**.",
      "Pastikan Aging terbaru sudah di-upload di Pusat Upload Data.",
    ], next: ["umum.upload"] },
    { id: "dc.rekon", q: "Terkumpul beda dengan Allocated", k: "rekonsiliasi selisih allocated in target", a: [
      "Terkumpul dihitung dari Aging (target − sisa); Allocated in Target dari pembayaran ERP bulan ini.",
      "Selisih biasanya karena pembayaran belum di-upload atau Aging belum terbaru.",
      "Klik baris di tabel Rekonsiliasi untuk melihat rincian per invoice.",
    ] },
    { id: "dc.closing", q: "Cara closing bulan", k: "kunci snapshot riwayat revisi tutup", a: [
      "Tekan **Closing Bulan** untuk mengunci angka bulan itu (snapshot).",
      "Bulan yang sudah closing tidak berubah walau ada upload baru.",
      "Perubahan setelah closing tercatat di **Riwayat Closing**.",
    ] },
    { id: "dc.top10", q: "Melihat BP jatuh tempo terlama", k: "10 bp umur overdue", a: [
      "Lihat kartu **10 BP · Jatuh Tempo Terlama** — invoice target belum lunas, urut dari umur jatuh tempo terlama.",
      "Rincian per Marketing/Branch/Collection ada di tabel Rincian Pencapaian.",
    ] },
  ],
  "/dashboard/tukar-faktur": [
    { id: "dt.baca", q: "Cara membaca dashboard", k: "sudah tf belum tf rata-rata hari", a: [
      "Pilih **Bulan** (bulan invoice date).",
      "Lihat Jumlah Invoice, Sudah TF, Belum TF & Rata-rata Hari per kelompok.",
      "Rata-rata hari = tanggal tukar faktur − invoice date.",
    ], next: ["dt.rinci"] },
    { id: "dt.rinci", q: "Melihat rincian invoice", k: "detail klik baris", a: [
      "Klik salah satu baris untuk membuka rincian invoice (status TF, tanggal TF, lama TF, keterangan).",
    ] },
    { id: "dt.beda", q: "Invoice sudah TF tapi masih Belum TF", k: "status salah tidak berubah", a: [
      "Pastikan tukar faktur sudah dicatat (Aplikasi Kolektor, Ekspedisi, atau Tukar Faktur Via Kolektor di Daftar Tagihan).",
      "Klik **Refresh data** di bilah atas lalu cek lagi.",
    ] },
  ],
  "/mutasi-bank": [
    { id: "mb.baca", q: "Arti angka Mutasi Bank vs Realisasi", k: "uang masuk penjualan target alokasi", a: [
      "**Penjualan** = total invoice bulan itu. **Uang masuk** = dana diterima di bulan itu.",
      "**Target tagihan** = tagihan periode sebelum bulan itu.",
      "Pembayaran dialokasikan ke target dulu, lalu penjualan bulan berjalan, sisanya tagihan lain (tidak tumpang tindih).",
    ] },
    { id: "mb.upload", q: "Cara upload mutasi rekening", k: "rekening koran bank file sheet", a: [
      "Upload file mutasi; boleh beberapa file & beberapa sheet.",
      "Rekening dikenali dari 4 digit terakhir (nama sheet atau baris \"No. rekening :\").",
      "Hanya baris CR yang disimpan; tanggal yang tercakup file akan diganti data baru.",
    ], next: ["mb.payment"] },
    { id: "mb.payment", q: "Cara upload Invoice & Payment", k: "erp payment comparison", a: [
      "Pakai laporan ERP **Invoice and Payment Date Comparison** (per tanggal invoice atau payment).",
      "Data yang sama dipakai Presentasi & Marketplace — cukup upload sekali.",
    ] },
    { id: "mb.exclude", q: "Mengecualikan transaksi", k: "dikecualikan manual tidak dihitung", a: [
      "Tandai transaksi mutasi sebagai **Dikecualikan manual** agar tidak dihitung sebagai uang masuk.",
    ] },
  ],
  "/presentasi": [
    { id: "pr.isi", q: "Cara mengisi data presentasi", k: "template upload excel slide", a: [
      "Pilih bulan → **Download template** → isi → upload kembali.",
      "Atau upload file mentah ERP (Aging, Invoice, Invoice payment date, Business Partner); boleh beberapa sekaligus.",
      "Bulan tercentang bila semua sheet wajib sudah terisi.",
    ] },
    { id: "pr.unduh", q: "Cara unduh / cetak presentasi", k: "pdf print excel", a: [
      "Gunakan **Cetak / PDF** untuk slide, atau **Download Excel** untuk datanya.",
    ] },
    { id: "pr.edit", q: "Mengubah teks slide", k: "edit teks narasi", a: [
      "Pakai **Edit teks** pada slide. **Kembalikan semua teks otomatis** untuk reset ke teks bawaan.",
    ] },
  ],
  "/collection": [
    { id: "col.filter", q: "Mencari invoice / BP tertentu", k: "filter cari collection payment group bp tanggal", a: [
      "Pilih **Collection** dulu, lalu ketik di kotak **Cari invoice, BP, catatan…**.",
      "Persempit dengan filter Business Partner, Payment Group, dan rentang Invoice date.",
      "Tidak ada hasil? Hapus filter/kata cari lalu coba lagi.",
    ], next: ["col.status", "col.wa"] },
    { id: "col.status", q: "Update status & jadwal bayar", k: "catatan jadwal bayar keterangan case administratif", a: [
      "Centang invoice → tombol **Update Status Tagihan**.",
      "Isi Catatan / **Jadwal Bayar** (tanggal rencana bayar). Jadwal Bayar sama dengan di Mitra10 & Dashboard Collection — yang terakhir diisi yang berlaku.",
      "Tombol **Keterangan** = keterangan invoice bersama (sama dengan Mitra10 & Hold Faktur Pajak).",
    ] },
    { id: "col.tf", q: "Input tukar faktur via kolektor", k: "tukar faktur manual lupa update kolektor resi ekspedisi", a: [
      "Centang invoice → tombol **Tukar Faktur**.",
      "Isi Nama Kolektor & Tanggal Tukar Faktur, lalu **Simpan Semua**.",
      "Dicatat sebagai input manual atas nama Kakak; invoice yang sudah diupdate kolektor dilewati.",
    ] },
    { id: "col.wa", q: "Kirim tagihan lewat WhatsApp", k: "wa pesan kontak nomor template", a: [
      "Pilih kontak BP (ikon kontak) lalu kirim pesan WA.",
      "**Edit Pesan WA** untuk mengubah teks; {{collection}} = nama collection, {{total}} = total tagihan.",
      "Pesan yang diedit hanya tersimpan di perangkat itu. Template bawaan diatur di Pengaturan › Template WA.",
    ] },
    { id: "col.export", q: "Unduh Excel / cetak daftar tagihan", k: "export print download", a: [
      "Atur filter dulu, lalu pakai tombol Excel/cetak di bilah aksi — hasil mengikuti filter aktif.",
    ] },
    { id: "col.kpi", q: "Melihat KPI aging & rekap jatuh tempo", k: "kpi rekap alokasi due date", a: [
      "Buka panel **KPI Aging & Rekap**: Rekap Jatuh Tempo per bulan (Due Date) dan Total Alokasi per hari.",
    ] },
  ],
  "/collection/case": [
    { id: "case.baca", q: "Isi halaman Case", k: "log catatan administratif", a: [
      "Rekap semua catatan **Case** & **Administratif** dari seluruh Collection, terbaru di atas.",
      "Catatan ditulis dari Daftar Tagihan; di sini hanya untuk memantau.",
    ] },
  ],
  "/collection/history-pembayaran": [
    { id: "hp.baca", q: "Cara membaca History Pembayaran", k: "payment date bp riwayat bayar", a: [
      "Periode = payment date. Hanya invoice ber-tempo (Net N Days), tanpa TikTok/Shopee.",
      "Pilih BP untuk melihat pola bayarnya per bulan.",
    ] },
    { id: "hp.kosong", q: "Bulan tertulis \"belum ada data\"", k: "kosong", go: "/pengaturan/upload", a: [
      "Data pembayaran bulan itu belum di-upload. Upload **Invoice & Payment** di Pusat Upload Data.",
      "Bulan lama yang sudah diarsip otomatis diambil dari Arsip Data.",
    ] },
  ],
  "/tukar-faktur/jadwal": [
    { id: "tj.jadwal", q: "Melihat jadwal kolektor", k: "tanggal kurir toko lokasi", a: [
      "Pilih tanggal dengan panah ‹ › atau **Hari ini**.",
      "Terlihat toko & invoice per kolektor, status Sudah/In Progress, dan Titik Lokasi kunjungan.",
    ] },
    { id: "tj.laporan", q: "Membaca Laporan Harian", k: "laporan harian minggu total", a: [
      "Tab **Laporan Harian**: nilai tukar faktur per kolektor per hari. Kolom merah = hari Minggu.",
    ] },
    { id: "tj.kosong", q: "Jadwal tidak muncul", k: "kosong tidak ada jadwal", go: "/tukar-faktur/upload", a: [
      "Jadwal berasal dari Upload Jadwal (otomatis oleh Bot ERP tiap hari kerja).",
      "Cek tanggal yang dipilih, atau upload manual di **Tukar Faktur › Upload Jadwal**.",
    ] },
  ],
  "/tukar-faktur/kurir": [
    { id: "tk.langkah", q: "Langkah input tukar faktur kolektor", k: "kurir foto tanda terima simpan", a: [
      "Pilih **Nama Kurir** & **Tanggal Jadwal Pengiriman** → Lanjut.",
      "Pilih toko yang dikunjungi, centang invoice.",
      "Isi **Tanggal Diterima** & **Foto Tanda Terima**, lalu simpan.",
    ] },
    { id: "tk.kosong", q: "Toko / invoice tidak muncul", k: "tidak ada jadwal semua sudah diproses", a: [
      "Invoice yang sudah diproses tidak tampil lagi.",
      "Pastikan tanggal jadwal benar dan jadwal sudah di-upload.",
      "Payment Group opsional — kosongkan bila toko tidak ketemu.",
    ] },
    { id: "tk.hp", q: "Pakai di HP", k: "mobile kolektor tangki", a: [
      "Buka **kolektor.tangki.space** di HP. Role Kurir bisa masuk tanpa PIN.",
    ] },
  ],
  "/tukar-faktur/ekspedisi": [
    { id: "te.langkah", q: "Cara input No Resi ekspedisi", k: "resi tiki kirim", a: [
      "Centang invoice di tabel **Pilih Invoice**.",
      "Isi No Resi & tanggal tukar faktur, lalu simpan — tercatat sebagai tukar faktur metode Ekspedisi.",
    ] },
  ],
  "/tukar-faktur/upload": [
    { id: "tu.file", q: "Format file Upload Jadwal", k: "csv master kirim aging kolom", a: [
      "**File 1 Data Master Kirim (.csv)**: data mulai baris 6; B = Send Date, H = Business Partner, O = No Invoice, P = Date Invoice.",
      "**File 2 Data Aging** opsional — bila kosong, Payment Group, Marketing & Open Amt diambil dari tagihan terakhir.",
      "Jadwal diganti seluruhnya tiap upload; hasil kunjungan yang sudah tercatat tetap aman.",
    ] },
  ],
  "/mitra10": [
    { id: "m10.upload", q: "Urutan upload Mitra10", k: "aging receiving kwitansi jadwal bayar file", a: [
      "1. **Aging** (MASTER AGING / Blank_A4) — cukup sekali di sini atau di Pusat Upload.",
      "2. **Receiving**: GR_Report_Detail.csv (pemisah \";\").",
      "3. **Kwitansi**: Invoice_Summary.csv (pemisah \";\").",
      "4. **Jadwal Bayar**: Excel header NO KW, SPP, NILAI KW, TGL TUKAR FAKTUR, JADWAL TRANSFER, Notes.",
    ], next: ["m10.siap"] },
    { id: "m10.siap", q: "Arti status Siap TF", k: "status gr done pending", a: [
      "**Siap TF** = GR sudah Done, tapi Tukar Faktur masih Pending.",
    ] },
    { id: "m10.hilang", q: "Invoice hilang dari dashboard", k: "keluar hilang lunas", a: [
      "Invoice yang tidak ada di Aging terbaru keluar dari dashboard & Kertas Kerja (umumnya sudah lunas).",
      "Keterangan, tanggal TF, warna & data pendukung tetap tersimpan.",
    ] },
  ],
  "/rkm": [
    { id: "rkm.upload", q: "Urutan upload RKM", k: "aging receiving kwitansi grpo file", a: [
      "1. **Aging** (MASTER AGING / Blank_A4) — No SJ baru otomatis masuk Kertas Kerja.",
      "2. **Receiving**: Excel portal RKM (No. GRPO, No. Pengiriman, …) — mengganti seluruh isi Receiving.",
      "3. **Kwitansi**: Excel portal RKM — SJ di sini = Tukar Faktur Done; mengganti seluruh isi Kwitansi.",
    ] },
    { id: "rkm.lunas", q: "Kenapa invoice berstatus Lunas", k: "status lunas hilang", a: [
      "Invoice yang tidak ada lagi di Aging terbaru otomatis berstatus Lunas.",
    ] },
  ],
  "/monitor-surat-jalan": [
    { id: "sj.baca", q: "Arti angka Monitor SJ", k: "rata-rata waktu penerimaan umur belum diterima", a: [
      "**SJ di Aging** = No SJ unik dari Aging terbaru.",
      "**Rata-rata waktu penerimaan** = Receive Date − Invoice Date (hari kalender).",
      "**Umur belum diterima** = hari ini − Invoice Date.",
    ] },
    { id: "sj.upload", q: "Cara upload serah terima SJ", k: "csv laporan serah terima receiver", a: [
      "Upload CSV **LaporanSerahTerimaSuratJalan** (pemisah koma, maks. 60.000 baris).",
      "Hanya SJ yang ada di Aging terbaru & Receiver yang diakui yang disimpan; data lama tidak ditimpa.",
      "Bot ERP meng-upload 7 hari terakhir otomatis tiap hari kerja.",
    ] },
    { id: "sj.receiver", q: "SJ masih \"Belum diterima\"", k: "receiver diakui nonaktif", a: [
      "Cek apakah Receiver-nya ada & aktif di daftar Receiver yang diakui.",
      "Receiver baru berlaku untuk upload berikutnya — upload ulang laporannya.",
    ] },
  ],
  "/faktur/pengajuan": [
    { id: "fp.langkah", q: "Cara mengajukan pembatalan/revisi", k: "revisi pembatalan faktur pajak ajukan", a: [
      "Pilih Request: **Revisi Faktur** atau **Pembatalan Faktur**.",
      "Cari invoice, isi **Tax No**, **Reason Category** & **Keterangan** (wajib).",
      "Tambah invoice lain bila perlu (isian terbawa), lalu kirim. Status awal: Belum diproses.",
    ], go: "/faktur/list" },
    { id: "fp.reason", q: "Pilihan Reason Category", k: "alasan human eror", a: [
      "Human Eror (Delivery/Invoicing/Marketing/Fulfillment/IT/Warehouse/OR/Mkt Analis), Miss Information, Factor External, Request Customer.",
    ] },
  ],
  "/faktur/list": [
    { id: "fl.proses", q: "Menandai pengajuan sudah diproses", k: "diproses ltkp status", a: [
      "Buka pengajuan → tandai **Diproses**, isi **No LTKP**, lalu upload dokumen LTKP (PDF maks. 10 MB).",
    ] },
    { id: "fl.cari", q: "Mencari pengajuan", k: "filter status cari tax no", a: [
      "Filter **Status** (Belum/Sudah diproses) dan cari invoice, BP, Tax No, atau LTKP.",
    ] },
  ],
  "/faktur/hold": [
    { id: "fh.tambah", q: "Cara menambah hold faktur", k: "tahan faktur pajak keterangan", a: [
      "Klik **Tambah hold faktur**.",
      "Cari No Invoice (BP, Invoice Date & No SJ terisi otomatis) atau isi manual.",
      "Isi **Keterangan** (wajib) lalu simpan. Keterangan ini sama dengan di Daftar Tagihan & Mitra10.",
    ] },
    { id: "fh.ubah", q: "Mengubah / menghapus hold", k: "edit hapus", a: [
      "Pakai ikon **Ubah** atau **Hapus** di baris invoice.",
    ] },
  ],
  "/faktur/ltkp": [
    { id: "lt.cari", q: "Mencari dokumen LTKP", k: "pdf dokumen", a: [
      "Cari berdasarkan No Invoice, No LTKP, atau BP, lalu buka PDF-nya.",
      "Dokumen di-upload dari **Daftar Pengajuan** saat pengajuan diproses.",
    ] },
  ],
  "/coretax": [
    { id: "ct.langkah", q: "Cara memproses XML CoreTax", k: "xml bulk faktur pajak export", a: [
      "Klik **Pilih XML** untuk memuat file XML bulk faktur pajak dari CoreTax.",
      "Hapus faktur yang tidak diperlukan — faktur terhapus tidak ikut diekspor/disimpan.",
    ] },
  ],
  "/billing/email-customer": [
    { id: "ec.tanda", q: "Arti tanda ✓ kuning, ✓ hijau, ✗", k: "centang email kirim status", a: [
      "✓ kuning = ada penjualan, email belum dikirim.",
      "Klik → ✓ hijau = email sudah dikirim (klik lagi untuk batal).",
      "✗ = tidak ada penjualan di minggu itu.",
    ] },
    { id: "ec.tab", q: "Beda tab BP & Group (CBD/TOP)", k: "cbd top group payment group", a: [
      "4 tab: BP CBD, Group CBD, BP TOP, Group TOP.",
      "Tab Group: PIC AR & email berlaku untuk semua BP di Payment Group itu.",
    ] },
    { id: "ec.cbd", q: "Cara upload CBD Sales", k: "upload prepaid espay receipt", a: [
      "Tombol **Upload CBD Sales** → file ERP Payment/Receipt.",
      "Dipakai AR Receipt (Prepaid) & (Prepaid-ESPAY); dokumen Reversed diabaikan.",
      "Penjualan TOP diambil otomatis dari Invoice ERP di Pusat Upload.",
    ] },
  ],
  "/billing/komisi": [
    { id: "km.op", q: "Hitung PPh komisi orang pribadi", k: "pph 21 progresif dpp", a: [
      "DPP = 50% × komisi bruto, lalu tarif progresif: 5% (0–60 jt), 15% (60–250 jt), 25% (250–500 jt), 30% (500 jt–5 M), 35% (>5 M).",
      "Beberapa baris dihitung dari akumulasi DPP; lihat tabel **Rincian Lapisan**.",
    ] },
    { id: "km.badan", q: "Hitung PPh komisi badan", k: "pph 23", a: [
      "PPh 23 = 2% × komisi bruto. Diterima = komisi − PPh (dibulatkan ke bawah).",
    ] },
    { id: "km.simpan", q: "Apakah angka tersimpan?", k: "hilang simpan", a: [
      "Tidak. Kalkulator ini tidak menyimpan ke database — angka hilang saat halaman ditutup.",
    ] },
  ],
  "/cek-harga": [
    { id: "ch.so", q: "Cara upload SO", k: "sales order erp sheet0", a: [
      "Upload Excel SO dari ERP (tab Sheet0); data MASTER lama diganti seluruhnya.",
      "Filter awalan BP dipisah koma (kosong = semua); filter Document Status harus persis.",
    ] },
    { id: "ch.po", q: "Cara upload PO", k: "purchase order mitra10 rkm csv", a: [
      "Pilih kategori dulu: **Mitra10** = CSV (No PO kolom A, Total IDR kolom U); **RKM** = Excel (Docnum kolom A, Total kolom E).",
      "Boleh lebih dari 1 file.",
    ] },
    { id: "ch.arsip", q: "Baris kuning di Arsip", k: "tindakan koreksi keterangan", a: [
      "Baris kuning = Tindakan Koreksi / Keterangan belum diisi.",
    ] },
  ],
  "/marketplace": [
    { id: "mp.file", q: "Laporan yang bisa di-upload", k: "shopee tiktok penghasilan saldo", a: [
      "Shopee: Laporan Penghasilan (sheet Summary + Penghasilan) & Riwayat Saldo (Transaction Report).",
      "TikTok: Laporan + Detail pesanan.",
    ] },
    { id: "mp.rekon", q: "Rekonsiliasi & selisih refund", k: "mutasi saldo kelebihan potong", a: [
      "**Rekonsiliasi Laporan vs Mutasi Saldo** membandingkan dana dilepas dengan saldo.",
      "**Analisis Selisih Refund** menampilkan total kelebihan potong.",
    ] },
  ],
  "/tools/pdf-editor": [
    { id: "pdf.gabung", q: "Gabung / urutkan PDF", k: "merge putar hapus halaman", a: [
      "Masukkan beberapa file → semua halaman tampil.",
      "Seret untuk mengurutkan, putar atau hapus per halaman, lalu terapkan.",
    ] },
    { id: "pdf.foto", q: "Foto jadi PDF", k: "jpg png gambar heic", a: [
      "Setiap foto jadi satu halaman; seret untuk mengurutkan.",
      "Format: JPG, PNG, WebP, GIF, BMP. HEIC/HEIF (iPhone) ubah dulu ke JPG.",
    ] },
    { id: "pdf.kompres", q: "Kompres ukuran PDF", k: "kecilkan size", a: [
      "**Aman**: 0–25% lebih kecil, teks tetap bisa dipilih.",
      "**Kuat**: jauh lebih kecil, tapi halaman jadi gambar.",
    ] },
    { id: "pdf.aman", q: "Apakah file dikirim ke server?", k: "privasi aman", a: [
      "Tidak. Semua diproses di browser; tutup/refresh tab = daftar kosong.",
    ] },
  ],
  "/pengaturan/upload": [
    { id: "pu.file", q: "File apa saja yang diterima", k: "aging invoice payment target mutasi", a: [
      "Aging (Blank_A4), Invoice & Payment Date Comparison, Target bulanan, Mutasi rekening — boleh banyak sekaligus.",
      "Upload ulang file yang sama tidak bikin data dobel.",
    ] },
    { id: "pu.check", q: "Arti checklist upload", k: "silang centang harian", a: [
      "Checklist kembali silang setiap ganti hari (WIB). Target cukup sekali per bulan.",
    ] },
    { id: "pu.gagal", q: "Upload gagal / file ditolak", k: "error gagal format salah", a: [
      "Pastikan file asli dari ERP (jangan diubah nama kolom/sheet-nya).",
      "Coba upload satu per satu untuk tahu file mana yang bermasalah.",
    ] },
  ],
  "/pengaturan/target": [
    { id: "pt.format", q: "Format file target", k: "kolom invoice open amt", a: [
      "Wajib: **Invoice No** dan **Target** (atau Open Amt).",
      "Opsional: Marketing, Collection Name, Business Partner, Due Date, Branch — kosong = diambil dari tagihan.",
      "Upload ulang bulan yang sama akan mengganti target bulan itu.",
    ] },
  ],
  "/pengaturan/arsip": [
    { id: "pa.lihat", q: "Melihat data lama (arsip)", k: "arsip drive historis periode", a: [
      "Pilih jenis data & periode → tabel bisa dicari, difilter, dan diunduh Excel.",
      "Isi: Pembayaran ERP, Invoice ERP, Snapshot Aging, Target Collection, Mutasi Bank.",
    ] },
    { id: "pa.backup", q: "Cadangan mingguan", k: "backup senin", a: [
      "Tiap Senin 01:00 WIB tabel master dicadangkan ke Google Drive (12 terakhir disimpan). Khusus Super Admin.",
    ] },
  ],
  "/pengaturan/wa-template": [
    { id: "pw.edit", q: "Mengubah template WA", k: "pesan placeholder", a: [
      "Template ini bawaan untuk semua collection.",
      "Placeholder: {{collection}} = nama collection, {{total}} = total tagihan.",
    ] },
  ],
};

// ── Teks percakapan ─────────────────────────────────────────────────────────────────────────────────────────────
export const CHAT_TEXT = {
  greet: (name: string) => `Hai${name ? ` Kak ${firstName(name)}` : " Kak"} 👋`,
  ask: (menu: string) => `Ada yang bisa aku bantu di menu **${menu}**? Pilih pertanyaan di bawah ya.`,
  switched: (menu: string) => `Kakak sekarang di menu **${menu}**. Mau tanya apa di sini?`,
  confirm: "Sudah terjawab, Kak?",
  thanks: "Sama-sama, Kak 😊 Kalau ada kendala lagi, tinggal klik pertanyaan di bawah ya.",
  stillConfused: "Maaf ya Kak, belum pas. Coba pilih pertanyaan lain atau ketik kendalanya singkat.",
  otherPrompt: "Boleh ketik kendalanya singkat, Kak (mis. \"upload aging\" atau \"jadwal bayar\").",
  found: "Ini yang paling mirip, Kak:",
  notFound: "Maaf Kak, aku belum punya jawabannya. Coba kata lain, atau hubungi Admin/Super Admin AR.",
  allTopics: "Ini topik umum yang sering ditanyakan:",
} as const;

export const ACTION = {
  done: "Sudah jelas, makasih 🙏",
  confused: "Masih bingung",
  back: "Pertanyaan lain di menu ini",
  general: "Topik umum",
  other: "Hal lainnya…",
} as const;

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? "";
}

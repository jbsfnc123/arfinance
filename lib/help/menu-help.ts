// Penjelasan per halaman untuk chatbot AR Helpdesk (Fase 63). Teks keterangan/aturan yang dulu tampil di halaman
// dipindah ke sini; tampilan hanya menampilkan data. `menu` = nilai yang dikirim ke chatbot (menuLabel(href)).
// Dipakai scripts/export-menu-help.mjs untuk membangkitkan MenuHelp.js di Apps Script.

export type MenuHelp = { href: string; menu: string; text: string[] };

export const MENU_HELP: MenuHelp[] = [
  { href: "/dashboard/collection", menu: "Dashboard › Collection", text: [
    "Memantau kinerja collection & piutang outstanding per bulan target.",
    "Total Target = jumlah target bulan terpilih (Pengaturan › Upload Target Bulanan). Sudah Terkumpul = target − sisa di Aging. Sisa Outstanding = invoice target yang belum lunas. Jadwal Bayar = invoice target yang punya Jadwal Bayar (dari Daftar Tagihan atau upload Jadwal Bayar Mitra10).",
    "Terkumpul + Jadwal Bayar = perkiraan pencapaian bila semua jadwal bayar terealisasi.",
    "10 BP · Jatuh Tempo Terlama = invoice target yang belum lunas, diurutkan dari umur jatuh tempo terlama.",
    "Rincian Pencapaian = target, terkumpul, sisa & jadwal bayar per kelompok (Marketing / Branch / Collection).",
    "Rekonsiliasi Terkumpul vs Allocated in Target: Terkumpul = target − sisa aging; Allocated in Target = pembayaran ERP bulan ini yang masuk ke invoice target. Klik baris untuk rincian invoice.",
    "Bila kosong: belum ada data Aging/target — upload lewat Pengaturan › Pusat Upload Data / Upload Target Bulanan.",
    "Closing Bulan mengunci angka bulan itu (snapshot); bulan yang sudah closing tidak berubah walau data baru di-upload. Riwayat Closing menampilkan revisi.",
  ] },
  { href: "/dashboard/tukar-faktur", menu: "Dashboard › Tukar Faktur", text: [
    "Periode = bulan invoice date. Rata-rata hari = tanggal tukar faktur − invoice date.",
    "Klik salah satu baris untuk melihat rincian invoice.",
  ] },
  { href: "/mutasi-bank", menu: "Dashboard › Mutasi Bank vs Realisasi", text: [
    "Penjualan {bulan} = total penjualan periode (Invoice Create). Uang masuk = dana diterima selama bulan itu. Target tagihan = tagihan periode sebelum bulan itu.",
    "Target bulan M tidak mencakup penjualan bulan M. Keempat pos alokasi tidak tumpang tindih: pembayaran dicocokkan ke target dulu, lalu penjualan bulan M, sisanya tagihan lain.",
    "Dikecualikan manual = transaksi mutasi yang ditandai tidak dihitung sebagai uang masuk.",
    "Upload Mutasi Rekening: boleh beberapa file & beberapa sheet; rekening dikenali dari 4 digit terakhir (nama sheet atau baris \"No. rekening :\"); hanya baris CR yang disimpan; \"SWITCHING PENGUIN\" diabaikan; tanggal yang tercakup file diganti.",
    "Upload Invoice & Payment: laporan ERP \"Invoice and Payment Date Comparison\" (per tanggal invoice atau payment), atau file berheader Invoice No., Invoice Amount, Invoice Date / Payment Document, Payment Amount, Payment Date. Data yang sama dipakai Presentasi & Marketplace — upload sekali saja.",
    "Upload Target: header Invoice No, Open Amt; mengganti seluruh target bulan terpilih (tabel target yang sama dengan Dashboard Collection).",
  ] },
  { href: "/collection", menu: "Collection › Daftar Tagihan", text: [
    "Pilih collection untuk melihat daftar tagihan. \"Data per\" = waktu update Aging terakhir.",
    "Bila kosong: belum ada data tagihan — upload Aging lewat Pengaturan › Pusat Upload Data.",
    "Bila tidak ada invoice yang cocok: ubah atau hapus filter/kata cari.",
    "Tombol Keterangan: keterangan invoice bersama — sama dengan Mitra10 & Hold Faktur Pajak.",
    "Catatan › Jadwal Bayar: tanggal rencana bayar per invoice; satu field yang sama dengan Jadwal Bayar Mitra10 dan Dashboard Collection; nilai terakhir yang diisi yang berlaku.",
    "Tukar Faktur Via Kolektor: untuk kolektor yang lupa update di Aplikasi Kolektor. Tanpa foto; dicatat sebagai input manual atas nama pengisi dan ikut Jadwal Kolektor & Laporan Harian Kolektor. Invoice yang sudah diupdate kolektor dilewati.",
    "Edit Pesan WA: placeholder {{collection}} = nama collection, {{total}} = total tagihan. Pesan ini hanya tersimpan di perangkat tersebut.",
  ] },
  { href: "/collection/case", menu: "Collection › Case", text: [
    "Log catatan Case (collection) dan Administratif dari seluruh Collection.",
  ] },
  { href: "/collection/history-pembayaran", menu: "Collection › History Pembayaran BP", text: [
    "Periode = payment date. Hanya invoice ber-tempo (Net N Days) dan tanpa TikTok/Shopee.",
    "\"belum ada data\" pada bulan = data pembayaran bulan itu belum di-upload (Invoice & Payment).",
  ] },
  { href: "/tukar-faktur/jadwal", menu: "Tukar Faktur › Laporan & Jadwal Kolektor", text: [
    "Laporan Harian: kolom merah = hari Minggu. Total = penjumlahan nilai harian.",
  ] },
  { href: "/tukar-faktur/kurir", menu: "Tukar Faktur › Aplikasi Kolektor", text: [
    "Payment Group bersifat opsional, untuk menyaring toko.",
  ] },
  { href: "/tukar-faktur/ekspedisi", menu: "Tukar Faktur › Ekspedisi", text: [
    "Catat No Resi invoice yang dikirim lewat ekspedisi; data diambil dari Aging terbaru.",
    "Langkah: centang invoice di tabel Pilih Invoice, lalu isi No Resi & tanggal tukar faktur. Tersimpan sebagai tukar faktur metode Ekspedisi.",
  ] },
  { href: "/tukar-faktur/upload", menu: "Tukar Faktur › Upload Jadwal", text: [
    "Jadwal kurir diganti seluruhnya setiap upload. Hasil kunjungan kurir yang sudah tercatat tidak terhapus.",
    "File 1 Data Master Kirim (.csv): data mulai baris 6. Kolom B = Send Date, H = Business Partner, O = No Invoice, P = Date Invoice (dd/MM/yyyy atau dd-MM-yyyy). Delimiter koma, titik koma, atau tab terdeteksi otomatis.",
    "File 2 Data Aging (opsional): bila dikosongkan, Payment Group, Marketing, dan Open Amt diambil dari data tagihan terakhir.",
    "Bot ERP juga meng-upload jadwal ini otomatis setiap hari kerja.",
  ] },
  { href: "/mitra10", menu: "Tukar Faktur › Mitra10 Tukar Faktur", text: [
    "Upload 1 Aging: file MASTER AGING / Blank_A4 — laporan yang sama dengan Update Tagihan, cukup sekali (di sini atau di Pusat Upload). Mitra10 membaca baris dengan Tax Name terpilih; Aging terbaru menggantikan data aktif. Invoice yang tidak ada di Aging terbaru keluar dari dashboard & Kertas Kerja; keterangan, tanggal tukar faktur, warna & data pendukung tetap tersimpan.",
    "Upload 2 Receiving: GR_Report_Detail.csv (pemisah \";\"). SJ NO dibentuk dari Vendor Ship No; baris baru (GR No + Item Code belum ada) ditambahkan.",
    "Upload 3 Kwitansi: Invoice_Summary.csv (pemisah \";\"). Invoice No yang sudah ada dilewati.",
    "Upload 4 Jadwal Bayar: Excel dengan header NO KW, SPP, NILAI KW, TGL TUKAR FAKTUR, JADWAL TRANSFER, Notes. No KW yang sudah ada diperbarui; Jadwal Bayar invoice di KW tersebut ikut terisi (satu field dengan Daftar Tagihan).",
    "Siap TF = GR sudah Done, Tukar Faktur masih Pending.",
  ] },
  { href: "/rkm", menu: "Tukar Faktur › RKM Tukar Faktur", text: [
    "Upload Aging: MASTER AGING / Blank_A4 (cukup sekali, di sini atau di Pusat Upload). RKM membaca baris dengan Tax Name terpilih; No SJ baru otomatis masuk Kertas Kerja dan invoice yang hilang dari aging berstatus Lunas.",
    "Upload Receiving: Excel portal RKM (No. GRPO, No. Pengiriman, Tanggal GRPO, Jumlah GRPO/GRN, No. Faktur Pajak, Cabang, dst.). No. Pengiriman dicocokkan dengan No SJ aging. Mengganti seluruh isi Receiving.",
    "Upload Kwitansi: Excel portal RKM (No. GRPO, No. Pengiriman, No. Faktur Pajak, Jumlah Faktur Pajak, Pembuat, Tanggal Input, dst.). SJ yang ada di sini = Tukar Faktur Done. Mengganti seluruh isi Kwitansi.",
  ] },
  { href: "/monitor-surat-jalan", menu: "Tukar Faktur › Monitor Surat Jalan", text: [
    "SJ di Aging = No SJ unik dari Aging terbaru (No SJ gabungan dipecah). Bila kosong: upload Aging dulu di Pusat Upload.",
    "Rata-rata waktu penerimaan = Receive Date tersimpan (Receiver yang diakui) − Invoice Date di Aging (hari kalender), satu nilai per SJ; durasi negatif & tanggal masa depan tidak dihitung. Umur belum diterima = hari ini − Invoice Date.",
    "Upload: file CSV LaporanSerahTerimaSuratJalan (pemisah koma, maks. 60.000 baris). Yang disimpan per SJ hanya Receive Date & Receiver.",
    "Aturan upload: hanya SJ yang ada di Aging terbaru yang disimpan; per SJ dipakai baris pertama dengan Receiver diakui & Receive Date valid; hanya mengisi SJ yang belum punya Receive Date (data lama tidak ditimpa); SJ yang keluar dari Aging masuk daftar Pembersihan Data; upload bersifat utuh (gagal = tidak ada yang tersimpan, aman diulang).",
    "Receiver yang diakui: hanya baris dengan Receiver aktif di daftar yang disimpan (tanpa beda huruf besar/kecil & spasi). Menonaktifkan Receiver membuat SJ yang diterimanya kembali \"Belum diterima\"; menambah Receiver berlaku untuk upload berikutnya; data tersimpan tidak diubah; perubahan dicatat di jejak perubahan.",
    "Bot ERP meng-upload laporan serah terima 7 hari terakhir setiap hari kerja.",
  ] },
  { href: "/faktur/pengajuan", menu: "Faktur Pajak › Pengajuan Pembatalan & Revisi", text: [
    "Satu pengajuan bisa berisi beberapa invoice. Request, alasan, dan keterangan terbawa ke invoice berikutnya.",
  ] },
  { href: "/faktur/list", menu: "Faktur Pajak › Daftar Pengajuan", text: [
    "Keterangan invoice sama dengan Collection, Mitra10 & Hold.",
    "Dokumen LTKP: PDF maksimal 10 MB, disimpan privat — hanya bisa dibuka pengguna yang login.",
  ] },
  { href: "/faktur/ltkp", menu: "Faktur Pajak › LTKP", text: [
    "LTKP = Laporan Tindakan Koreksi & Pencegahan dari pengajuan pembatalan/revisi faktur.",
  ] },
  { href: "/coretax", menu: "Faktur Pajak › XML CoreTax", text: [
    "Muat file XML bulk faktur pajak dari CoreTax lewat tombol Pilih XML.",
    "Faktur yang dihapus tidak ikut diekspor atau disimpan.",
  ] },
  { href: "/billing/komisi", menu: "Billing › Komisi dan Cashback", text: [
    "Tab Komisi adalah kalkulator PPh komisi; angka yang diisi tidak disimpan ke database dan hilang saat halaman ditutup.",
    "Orang Pribadi (PPh 21, penerima bukan pegawai): DPP = 50% × jumlah komisi bruto, lalu dikenai tarif progresif Pasal 17: 0–60 juta 5%, 60–250 juta 15%, 250–500 juta 25%, 500 juta–5 miliar 30%, di atas 5 miliar 35%.",
    "Untuk beberapa baris, tarif progresif dihitung dari akumulasi DPP semua baris; setiap baris Transaksi adalah komisi satu transaksi; semua transaksi satu kelompok sehingga lapisan bersambung. Tabel Rincian Lapisan menampilkan potongan tiap transaksi per lapisan (mis. 50/80/20 jt: Trx 1 50 jt @5%, Trx 2 70 jt @5% + 10 jt @15%, Trx 3 20 jt @15%, total PPh 5,25 jt).",
    "Badan (PPh 23): PPh = 2% × jumlah komisi bruto.",
    "Diterima = jumlah komisi − PPh. Tidak ada pilihan tanpa NPWP karena NIK berlaku sebagai NPWP. Pembulatan rupiah ke bawah.",
    "Tab Cashback masih dalam pengembangan.",
  ] },
  { href: "/billing/email-customer", menu: "Billing › Email Customer", text: [
    "Email penagihan per Business Partner, 4 tab: BP CBD, Group CBD, BP TOP, Group TOP. Payment Group, Collection & Marketing yang kosong diisi dari database (Aging terkini, cadangan invoice ERP) lewat Key BP; nilai abu-abu = diisi dari database.",
    "Value (Key BP) mis. 1000258-PKP dicocokkan ke database; Payment Group dikosongkan agar diambil dari database. Tab Group: PIC AR & email mengikuti Payment Group (berlaku untuk semua BP di grup); menghapus grup juga mengarsipkan BP anggotanya. Catatan Email contoh: \"Kirim ke Adm Sales Surabaya\".",
    "Kolom minggu dipotong setiap Sabtu (mis. Okt: 1–3, 4–10, 11–17, 18–24, 25–31). ✓ kuning = ada penjualan, email belum dikirim; klik → ✓ hijau = email sudah dikirim (klik lagi untuk membatalkan); ✗ = tidak ada penjualan. KPI Total/Pending/Done mengikuti bulan, tab & filter tabel.",
    "Sumber penjualan TOP: invoice ERP \"Invoice and Payment Date Comparison\" (Pusat Upload), dicocokkan lewat Key BP.",
    "Sumber penjualan CBD: tombol Upload CBD Sales — file ERP Payment/Receipt; dipakai AR Receipt (Prepaid) & (Prepaid-ESPAY), tanggal = Transaction Date, dokumen Reversed diabaikan, Value = teks setelah \"_\" terakhir di Business Partner. Hanya tanda (Value + tanggal) yang disimpan, tanpa nominal.",
  ] },
  { href: "/cek-harga", menu: "Rekonsiliasi › Cek Selisih Harga PO/SO", text: [
    "Upload SO: file Excel SO dari ERP (tab Sheet0). Kolom: Document No, Date PO, No PO Customer (atau no_po), Business Partner, Price List, Document Status, Grand Total. Data MASTER lama diganti seluruhnya. Filter awalan Business Partner: pisahkan koma, kosongkan = semua. Filter Document Status: persis, kosongkan = semua.",
    "Upload PO: kategori menentukan tipe file & kolom — Mitra10: CSV, No PO di kolom A, Total IDR di kolom U; RKM: Excel, No PO (Docnum) kolom A, Total kolom E. Boleh lebih dari 1 file.",
    "Arsip: baris kuning = Tindakan Koreksi / Keterangan belum diisi.",
  ] },
  { href: "/marketplace", menu: "Rekonsiliasi › Marketplace", text: [
    "Laporan yang didukung: Laporan Penghasilan Shopee (sheet Summary + Penghasilan), Riwayat Saldo Shopee (Transaction Report), Laporan TikTok (Laporan + Detail pesanan).",
    "Mode arus kas: upload Laporan Penghasilan periode ini untuk grafik & rekonsiliasi. Dana dilepas = dana yang diterima penjual; Saldo Keluar = penarikan + penyesuaian.",
  ] },
  { href: "/presentasi", menu: "Dashboard › Presentasi AR", text: [
    "Template berisi 1 sheet per slide dan terisi data yang tersimpan untuk bulan itu. Data presentasi berdiri sendiri — tidak mengambil data dari menu lain. Bulan tercentang bila semua sheet wajib terisi.",
  ] },
  { href: "/tools/pdf-editor", menu: "Tools Support › PDF Editor", text: [
    "Semua diproses di browser — file tidak dikirim ke server; dokumen hanya tersimpan di memori tab (tutup/refresh = daftar kosong).",
    "Format gambar: JPG, PNG, WebP, GIF, BMP (dikonversi otomatis). HEIC/HEIF dari iPhone belum bisa dibaca browser — ubah dulu ke JPG.",
    "Foto → PDF: setiap foto jadi satu halaman; seret untuk mengurutkan, putar bila perlu; foto tidak gepeng/terpotong.",
    "Gabung: semua halaman tampil; seret untuk mengatur urutan, putar atau hapus per halaman, lalu terapkan.",
    "Halaman terakhir → pertama: memindahkan halaman terakhir menjadi halaman pertama untuk satu atau semua dokumen; nama file tetap.",
    "Tempel gambar: klik halaman, tempel dengan Ctrl+V, Pilih foto, atau seret foto ke halaman; geser untuk memindah, tarik sudut kanan bawah untuk ubah ukuran (tahan Shift untuk bebas).",
    "Kompres: Aman = struktur PDF disimpan ulang (0–25% lebih kecil, teks tetap bisa dipilih). Kuat = setiap halaman jadi gambar (jauh lebih kecil, teks tidak bisa dipilih lagi).",
  ] },
  { href: "/pengaturan/upload", menu: "Pengaturan › Pusat Upload Data", text: [
    "Upload laporan ERP sekali di sini — datanya tersimpan satu kali dan langsung dipakai semua menu terkait. Upload ulang file yang sama tidak membuat data dobel.",
    "File yang diterima: Aging (Blank_A4), Invoice & Payment Date Comparison, Target bulanan, Mutasi rekening; boleh banyak sekaligus.",
    "Checklist: status kembali silang setiap ganti hari (WIB). Target cukup sekali per bulan.",
    "Bot ERP meng-upload Aging otomatis setiap hari kerja.",
  ] },
  { href: "/pengaturan/target", menu: "Pengaturan › Upload Target Bulanan", text: [
    "Target menjadi dasar Total Target & Sudah Terkumpul di Dashboard Collection. Upload ulang untuk bulan yang sama mengganti target bulan itu.",
    "Kolom wajib: Invoice No dan Target (atau Open Amt). Opsional: Marketing, Collection Name, Business Partner, Due Date, Branch — bila kosong diambil dari data tagihan. Tata letak lama sheet \"Tagihan\" (A = Target, F = Invoice, J = Branch) juga diterima.",
  ] },
  { href: "/pengaturan/wa-template", menu: "Pengaturan › Template WA", text: [
    "Template bawaan untuk semua collection; collection tetap bisa mengubah pesan di perangkatnya lewat \"Edit Pesan WA\".",
    "Placeholder {{collection}} = nama collection, {{total}} = total tagihan.",
  ] },
  { href: "/", menu: "Beranda", text: [
    "Portal (Finance): pilih workspace; login berlaku di semua workspace tangki.space. AR Workspace = piutang (collection, tukar faktur, faktur pajak, rekonsiliasi); AP Workspace = hutang usaha (menyusul); Aplikasi Kolektor = tukar faktur kolektor di HP.",
  ] },
  { href: "/akun", menu: "/akun", text: [
    "Akun & PIN: setiap akun masuk dengan nama & PIN 6 digit; PIN tidak pernah ditampilkan ulang — gunakan Reset PIN bila lupa. Akun tanpa PIN wajib membuat PIN saat pertama masuk; setiap akun bisa mengganti PIN & foto profil dari menu akun.",
    "Hanya role Kurir yang boleh \"Masuk Aplikasi Kolektor tanpa PIN\". Akses menu diatur per akun (tombol Akses menu); akun baru mendapat default menu role-nya. Tanda +/− di Akses menu = berbeda dari default role. \"Menu disesuaikan\" = akses menu berbeda dari default role. Ganti role: tidak dicentang = akses menu akun tetap.",
    "Akses chatbot AR Helpdesk diaktifkan di formulir Tambah/Ubah akun; Super Admin selalu punya akses. Collection awal = collection yang terbuka pertama kali di Daftar Tagihan. Akun sistem (mis. Bot ERP) dipakai otomasi dan tidak bisa login dari halaman login.",
  ] },
  { href: "/acl", menu: "/acl", text: [
    "Role & Akses Menu: menu yang dicentang adalah default untuk akun baru dengan role tersebut; mengubahnya tidak mengubah akun yang sudah ada (akses tiap akun diatur di Akun & PIN). Super Admin otomatis melihat semua menu.",
  ] },
  { href: "/database", menu: "/database", text: [
    "Database Supabase project arfinance: isi tabel utama & riwayat import. ar_aging_snapshots/lines = Aging per bulan; erp_invoices/erp_payments = laporan Invoice & Payment; ar_targets = target bulanan; notes = catatan collection; payment_promises = Jadwal Bayar; invoice_exchanges = tukar faktur; invoice_remarks = keterangan invoice bersama; courier_updates = laporan harian kolektor; contacts = kontak WA per BP.",
    "Pembersihan Data: data yang invoice/SJ-nya sudah tidak ada di Aging terbaru (lunas) masuk daftar, tetapi TIDAK dihapus otomatis. Pilih kategori, periksa, centang, lalu hapus (permanen). Server hanya menghapus baris yang masih memenuhi syarat; penghapusan dicatat. Unduh Excel sebagai cadangan sebelum menghapus. Kontak tidak pernah masuk daftar ini.",
    "Egress/bandwidth tidak bisa dibaca dari database — lihat dashboard Supabase › Usage.",
  ] },
  { href: "/ai-settings", menu: "/ai-settings", text: [
    "Pengaturan AI: atur agent, API key, model, dan prioritas cadangan AR Helpdesk (khusus Super Admin).",
  ] },
];

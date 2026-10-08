# Bot ERP — Aging, Jadwal Tukar Faktur & Serah Terima Surat Jalan otomatis (Fase 55–57)

Setiap hari kerja (Task Scheduler, default Senin–Jumat), PC lokal menjalankan bot dengan tiga tugas berurutan:

1. **Aging Detail** — login Jaspersoft (report.tangki.id) → Library › *Aging Detail* → Organization *Penguin Trading*,
   Statement Date = hari ini (WIB), Tipe Transaksi *Piutang* → Apply → Export **Excel** → arsip Google Drive → kirim
   lewat jalur Pusat Upload (`lib/uploads/run.ts` → `upload_begin` / `upload_rows` / `aging_commit`).
   Tanggal laporan = hari ini, bulan Collection = bulan berjalan (sama seperti upload manual).
2. **Jadwal Tukar Faktur** — laporan *Report Send Invoice To Customer* (dicari lewat kotak pencarian Library),
   Tanggal Awal = Tanggal Akhir = hari ini → Export **CSV** → arsip Drive → parser halaman Upload Jadwal
   (`lib/modules/tukar/schedule.ts` `parseMasterCsv`) → `schedule_replace` (jadwal kurir **diganti seluruhnya**; hasil
   kunjungan kurir tidak terhapus). Tanpa file Aging kedua: Payment Group / Marketing / Open Amt diambil dari data
   tagihan (`ar_invoices` = Aging terkini, yang baru diperbarui tugas 1). Laporan kosong → jadwal lama dibiarkan.

3. **Serah Terima Surat Jalan** — laporan *Laporan Serah Terima Surat Jalan By Send Date*, Start Date = hari ini − 6,
   End Date = hari ini, Organization *Penguin Trading* → Export **CSV** → arsip Drive → parser halaman Monitor Surat Jalan
   (`lib/modules/sj/parse.ts` `parseSjCsv` + `receiptCandidates`, Receiver aktif dibaca dari `sj_receivers`) →
   `sj_receipts_apply`. **Insert-only**: hanya SJ di Aging terbaru yang belum punya Receive Date yang diisi; data lama
   tidak dihapus/ditimpa. Rentang 7 hari menangkap penerimaan yang tercatat terlambat; mengirim ulang aman.

Semua tugas berjalan sebagai akun sistem **Bot ERP** (menu `set.update` + `tukar.upload` + `tukar.monitor_sj`). Gagal
satu tugas tidak menghentikan tugas lain.

Kode: `automation/erp-bot/` (paket npm terpisah, tidak ikut build Vercel). Log: `automation/erp-bot/logs/<tanggal>.log`
(+ screenshot `error-*.png` bila Jaspersoft gagal). Riwayat upload di aplikasi menampilkan upload bot seperti biasa.

## Pemasangan (sekali)

1. **Akun Bot ERP** (di folder repo, butuh `.env.local` berisi service role):
   `node --env-file=.env.local scripts/create-bot-account.mjs` → salin `BOT_EMAIL` & `BOT_PASSWORD` yang dicetak.
   Akun ini tidak tampil di halaman login, tidak bisa login dengan nama/PIN, dan hanya punya akses Pusat Upload.
2. **ERP Drive Inbox** (Google Apps Script, akun Google pemilik folder arsip):
   - buat folder arsip di Drive, catat ID-nya (bagian URL setelah `/folders/`);
   - script.google.com → New project → tempel `automation/erp-bot/gas/Code.gs`; Project Settings → centang
     "Show appsscript.json" → tempel `gas/appsscript.json`;
   - Project Settings → Script Properties: `ARCHIVE_FOLDER_ID` = ID folder, `ERP_DRIVE_SECRET` = teks acak panjang;
   - Run `setupCheck` sekali (beri izin Drive);
   - Deploy → New deployment → Web app · Execute as **Me** · Who has access **Anyone** → salin URL `/exec`.
3. **Bot**: `cd automation/erp-bot && npm install`, salin `.env.example` → `.env`, isi semua nilai.
4. **Uji**: `npm run dry-run` (unduh + baca saja) → `npm start -- --no-drive` atau `npm start` (penuh).
5. **Jadwal**: `powershell -ExecutionPolicy Bypass -File install-task.ps1 -At 10:00` (default Senin–Jumat;
   `-Days Monday,Friday` untuk hari tertentu, `-Daily` untuk setiap hari).

## Perilaku & batasan

- File identik dengan upload sukses terakhir (sha256) → database dilewati (`--force` untuk tetap mengirim).
- Arsip Drive gagal → hanya peringatan; update database tetap jalan. Unduhan Jaspersoft dicoba 3x (jeda 30 dtk).
- Periode Collection sudah *closed*, file bukan Aging, atau 0 baris → gagal tanpa mengubah database (aging_commit atomik).
- PC harus menyala & user login; bila terlewat (PC mati), Task Scheduler menjalankan segera setelah PC aktif.
- Opsi: `--dry-run`, `--only aging|jadwal|sj`, `--file <xls>` (Aging dari file yang ada), `--jadwal-file <csv>`, `--sj-file <csv>`,
  `--no-drive`, `--force`. `BOT_HEADLESS=false` untuk melihat
  browser saat memeriksa masalah.

## Catatan teknis (pelajaran uji nyata 2026-10-09)

- Jaspersoft memakai Content-Security-Policy ketat → `page.setBypassCSP(true)` wajib, kalau tidak semua
  `waitForFunction` gagal diam-diam.
- Kode yang dijalankan di browser (`evaluate`/`waitForFunction`/`$eval`) tidak boleh berisi fungsi bernama: tsx (esbuild)
  menambahkan `__name()` yang tidak ada di halaman → ReferenceError.
- Organization dipilih dengan mengetik lalu mengklik item "PT. Penguin Trading" (daftar diawali "---" dan "*").
- Export: arahkan kursor & klik Export, lalu klik blok `p.wrap.button` "Excel" sekali; dialog Input Controls boleh tetap
  terbuka. Laporan ±3 menit, file ±12 MB, ±22 ribu baris.
- Hanya satu proses bot boleh berjalan (`logs/bot.lock`). Saat gagal: `logs/error-*.png` + `.html` untuk diagnosis.


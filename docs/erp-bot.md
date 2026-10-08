# Bot ERP — Aging Detail otomatis (Fase 55)

Setiap pagi, PC lokal menjalankan bot yang:

1. login ke Jaspersoft (report.tangki.id) → Library › **Aging Detail** → Organization *Penguin Trading*,
   Statement Date = hari ini (WIB), Tipe Transaksi *Piutang* → Apply → Export **Excel**;
2. mengarsipkan file ke Google Drive (folder arsip / `YYYY-MM`) lewat Web App Apps Script **ERP Drive Inbox**;
3. membaca file dengan parser yang sama dengan Pusat Upload (`lib/uploads/parse.ts`) dan mengirimnya lewat jalur yang
   sama (`lib/uploads/run.ts` → `upload_begin` / `upload_rows` / `aging_commit`) sebagai akun sistem **Bot ERP**.
   Tanggal laporan = hari ini, bulan Collection = bulan berjalan (sama seperti upload manual).

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
5. **Jadwal**: `powershell -ExecutionPolicy Bypass -File install-task.ps1 -At 07:00`.

## Perilaku & batasan

- File identik dengan upload sukses terakhir (sha256) → database dilewati (`--force` untuk tetap mengirim).
- Arsip Drive gagal → hanya peringatan; update database tetap jalan. Unduhan Jaspersoft dicoba 3x (jeda 30 dtk).
- Periode Collection sudah *closed*, file bukan Aging, atau 0 baris → gagal tanpa mengubah database (aging_commit atomik).
- PC harus menyala & user login; bila terlewat (PC mati), Task Scheduler menjalankan segera setelah PC aktif.
- Opsi: `--dry-run`, `--file <path>` (pakai file yang ada), `--no-drive`, `--force`. `BOT_HEADLESS=false` untuk melihat
  browser saat memeriksa masalah.

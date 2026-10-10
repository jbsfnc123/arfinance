# AR Bot — aplikasi desktop lokal (Fase 65)

Versi baru *Assistent Mando* dengan tampilan AR Workspace. Portable dan tanpa instalasi: server Node lokal ditambah jendela Edge `--app`.
Semua bot berjalan di PC ini. Kredensial dan file tidak meninggalkan PC, kecuali arsip Drive dan kiriman ke AR Workspace.

| Grup | Job | Hasil | Kirim ke AR Workspace |
|---|---|---|---|
| Jaspersoft | Aging Detail | Excel | `aging_commit` (Snapshot Aging / Daftar Tagihan) |
| | Send Invoice To Customer (Senin s/d hari ini) | CSV | `schedule_replace` (jadwal kurir diganti) |
| | Serah Terima Surat Jalan (7 hari) | CSV | `sj_receipts_apply` (insert-only) |
| | Invoice & Payment Date Comparison (bulan berjalan) | Excel | upload `erp` (bawaan: **nonaktif**) |
| EDI Mitra 10 | GR Report Detail (multi-akun, 30 hari) | CSV per akun | Mitra10 "Upload CSV GR": `m10_gr_add` (insert-only) |
| | Download Kwitansi (multi-akun, bulan berjalan) | CSV per akun | Mitra10 "Import Kwitansi": `m10_kw_add`, Username = akun EDI (insert-only) |
| | Upload Faktur Pajak Coretax | PDF dipecah per faktur | – (unggah ke EDI, dengan konfirmasi) |

Akun Bot ERP butuh menu `set.update`, `tukar.upload`, `tukar.monitor_sj`, `rek.mitra10` (`scripts/create-bot-account.mjs`).

## Pakai

- Buka lewat pintasan **AR Bot** (Desktop / Start Menu). Menutup jendela juga menghentikan server dalam ±20 detik; bot yang sedang berjalan tetap lanjut.
- **Dashboard › Jalankan beberapa task**: centang beberapa task (tanggal terisi default, bisa diubah), jalankan
  **paralel** (bawaan) atau berurutan. Pada mode paralel, tiap task memakai browser context sendiri (login, cookie, dan
  folder unduhan terpisah). Galat satu task tidak menghentikan task lain; Hentikan menghentikan semuanya.
  Default tanggal (`defaultDates`, sama untuk runner & UI): Send Invoice Senin s/d hari ini · GR 30 hari terakhir ·
  Kwitansi bulan ini · Invoice by Date tanggal 1 s/d hari ini · SJ 7 hari.
- **Uji Coba** hanya mengunduh dan membaca file, tanpa arsip Drive, tanpa kirim, dan tanpa unggah. Untuk Upload Faktur, Uji Coba hanya mencari dan memverifikasi di Draft.
- **Rangkaian & Jadwal**: urutan job dan jadwal hari/jam didaftarkan ke Task Scheduler (`\ARBot\AR Bot - <id>`, tanpa admin). Jadwal tetap berjalan walau aplikasi tertutup dan mengejar jadwal yang terlewat. Upload Faktur tidak boleh masuk rangkaian.
- **Pengaturan › Impor dari aplikasi lama**: membaca `.env` / `accounts.json` Assistent Mando dan `automation/erp-bot/.env` sekali, saat tombol diklik.

## Data & keamanan

- Program: `%LOCALAPPDATA%\ARBot\` (bin, app). Data: `%LOCALAPPDATA%\ARBot\data\`, di luar OneDrive.
  - `config.json`: pengaturan tanpa rahasia.
  - `secrets.dat`: sandi Jaspersoft / Bot ERP / Drive / akun EDI, terenkripsi **DPAPI** (hanya akun Windows ini).
  - `history.jsonl`, `runs\<runId>.jsonl` (log), `downloads\<job>\`, `shots\` (screenshot + HTML saat galat), `work\faktur\`.
  - File unduhan, log, dan screenshot dihapus otomatis setelah N hari (Pengaturan, bawaan 30).
- Server hanya `127.0.0.1`. Header Host dan Origin harus cocok, dan semua `/api` wajib token sesi acak (diberikan lewat `#t=` saat jendela dibuka). Rahasia tidak pernah dikirim ke UI dan disamarkan (●●●) di log.
- Satu run sekaligus (`data\run.lock`). File identik dengan kiriman sukses terakhir tidak dikirim (dan tidak diarsip) ulang; centang **Paksa kirim ulang** untuk memaksa.
- Galat diulang 2× (jeda 20 dtk), kecuali galat pengaturan/kredensial dan Upload Faktur (aksi tulis di situs luar).

## Pengembangan

```
cd automation/ar-bot
npm install
npm test             # vitest (jadwal, DPAPI, browser, PO, pecah PDF)
npm run typecheck
npm run build        # → dist\ARBot (±166 MB: node.exe, bundel, UI, puppeteer-core, pdfjs-dist)
npm run deploy       # build + pasang ke %LOCALAPPDATA%\ARBot + pintasan (data tidak disentuh)
```

- UI (`src/ui`) memakai `app/globals.css`, `components/ui.ts`, ikon, `Tabs`/`Modal`/`Toast` AR Workspace langsung dari repo (Vite alias `@`). React dipaksa satu salinan (alias di `vite.config.ts`).
- Server/runner (`src/server`, `src/runner`, `src/jobs`) memakai parser & RPC upload yang sama dengan aplikasi web (`lib/uploads`, `lib/modules/tukar`, `lib/modules/sj`).
- Pemecah PDF (`src/faktur/split.ts`) adalah port `split_faktur.py`. Hasilnya identik pada 8 contoh nyata:
  `FAKTUR_SAMPLES=<folder pdf> FAKTUR_PY=<folder Assistent Mando> npx vitest run src/faktur`.
- Mode uji server: `ARBOT_DATA_DIR=<folder sementara> ARBOT_NO_WINDOW=1 ARBOT_PORT=39371 bin\node.exe app\server.mjs`.
- Kode yang dijalankan di halaman (`evaluate`/`waitForFunction`) tidak boleh memakai fungsi bernama (lihat `jobs/jasper/session.ts`).

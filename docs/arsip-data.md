# Arsip data & cadangan Google Drive (Fase 66)

Tujuan: Supabase (paket gratis: DB 500 MB, egress 5 GB) hanya memegang **data operasional**, yaitu invoice yang masih di Aging dan bulan yang masih aktif. Data historis dipindah ke **Google Drive** dan tetap bisa dibuka dari web.

## Lapisan data

| Lapisan | Isi | Tempat |
|---|---|---|
| Operasional | data harian, invoice di Aging, bulan berjalan / periode Collection terbuka | Supabase |
| Arsip | data historis yang melewati masa simpan (dihapus dari Supabase setelah terverifikasi) | Drive: `AR Workspace Arsip/<dataset>/<periode> <stempel>.json.gz` |
| Cadangan | salinan mingguan tabel master (tidak dihapus dari Supabase), 12 terakhir | Drive: `AR Workspace Arsip/_backup/<tanggal> WIB.json.gz` |

## Retensi (`private.archive_rows`, migrasi `20261011100000_data_archive.sql`)

| Dataset | Tetap di Supabase | Periode arsip |
|---|---|---|
| `erp_payments` | bulan berjalan + bulan Collection terbuka | bulan pembayaran; tiap baris membawa salinan invoice (`invoice`) |
| `erp_invoices` | masih di Aging terbaru, punya pembayaran di DB, atau bulannya disimpan | bulan invoice (jadi kandidat setelah pembayarannya diarsip) |
| `aging_snapshot` | snapshot terbaru + snapshot periode Collection terbuka | id snapshot |
| `ar_targets` | bulan yang belum Closed | bulan Closed (data beku tetap di `collection_closings`) |
| `bank_mutations` | bulan berjalan + bulan terbuka | bulan transaksi (dari `v_bank_mutations`, termasuk status dikecualikan) |

`aging_commit` hanya menghapus snapshot lama yang **sudah diarsip**. Sebelumnya snapshot selain 2 terbaru dihapus tanpa arsip.

## Alur arsip (Finance › Database › Arsip ke Google Drive, Super Admin, manual)

`POST /api/archive/run`:
1. `archive_export` per 5.000 baris.
2. Gabung dengan arsip lama periode yang sama, bila ada.
3. gzip lalu GAS `put` (simpan + baca ulang ukuran & sha256).
4. `archive_record`.
5. `archive_purge`, yang menolak bila jumlah baris atau nominal berubah sejak ekspor, lalu mencatat ke `cleanup_log` (mode `arsip`).

## Membaca arsip

- **Menu Pengaturan › Arsip Data** (`set.arsip`): tabel per dataset & periode, plus unduh Excel.
- **Penarikan otomatis** (`lib/archive/hooks.ts`, `lib/archive/merge.ts`) di History Pembayaran, Mutasi Bank (dashboard & data, hanya-baca), grafik alokasi KPI Daftar Tagihan, dan Email Customer (✓ TOP).
- **Hak baca** (`private.archive_can_read`): sama dengan hak baca data aslinya. Controller, Super Admin, dan pemegang `set.arsip` boleh membaca semua.
- `GET /api/archive/read?id=` mengirim file gzip apa adanya, dengan cache browser `immutable` (versi baru = id baru).

## Cadangan mingguan

- Vercel Cron `0 18 * * 0` (Senin 01:00 WIB) memanggil `/api/backup/weekly` (header `Authorization: Bearer CRON_SECRET`, service role). Super Admin juga bisa memicunya dari halaman Arsip Data.
- Tabel yang dicadangkan: semua tabel public kecuali yang tercantum di `private.backup_table_list` (Aging, ERP, target, mutasi, indeks/turunan). Kolom `pin_hash` tidak ikut.
- Pemulihan: unduh Excel dari Arsip Data; impor balik dilakukan manual (upsert) bila diperlukan.

## Konfigurasi

- **GAS** `automation/archive-gas` (proyek "AR Archive"):
  - `Secret.gs` tidak di-commit;
  - jalankan `setup` sekali (izin Drive);
  - Deploy sebagai Web app (Execute as Me, Anyone).
- **Env Vercel**: `ARCHIVE_GAS_URL`, `ARCHIVE_GAS_SECRET`, `CRON_SECRET`. Nilainya ada di `.env.local` PC developer.
- `/api` dipakai bersama semua workspace (`lib/workspace.ts` SHARED) dan tidak di-rewrite per workspace.

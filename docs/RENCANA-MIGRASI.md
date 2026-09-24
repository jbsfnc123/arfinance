# Rencana Migrasi: 10 Aplikasi GAS/VBA → 1 Website "AR Workspace" (GitHub + Vercel + Supabase)

## Context
Folder `Web Project` berisi 10 aplikasi keuangan/AR PT Penguin Trading yang terpisah-pisah:
- **Web app GAS (Google Apps Script)** yang terikat ke Google Sheets: Aplikasi Utama (App Shell), Tukar Faktur, Pembatalan & Revisi Faktur, Billing, Cek Selisih Harga, XML CoreTax.
- **Macro Excel (VBA)**: Mitra10 Tukar Faktur, Mutasi Bank vs Realisasi.
- **HTML statis**: MarketPlace, Presentasi (data disimpan di localStorage/IndexedDB).

Kondisi sekarang yang jadi masalah:
- Aplikasi saling tersambung hanya lewat iframe dan salinan sheet manual (`Invoice` = salinan `Update_Tagihan`, `Tukar Faktur`/`Jadwal Kolektor` = salinan sheet `Update`/`Jadwal`).
- Keamanannya lemah:
  - PIN default `123456`.
  - Admin secret Firebase terkirim ke browser (`getRtConfig`).
  - Halaman upload Tukar Faktur dan seluruh Pembatalan tidak punya auth.
- Data yang sama (invoice, payment, aging) diimpor berulang kali di beberapa aplikasi.

**Tujuan:** satu website Next.js di Vercel, dengan satu database Postgres (Supabase), satu login (Google @penguin.id), satu sidebar menu dengan ACL (hak akses per menu), dan data master yang dipakai bersama semua modul.

**Keputusan yang sudah diambil:**
- Login: Google OAuth yang dibatasi ke domain penguin.id.
- Supabase: buat **project baru**.
- Email Billing: **tetap lewat endpoint GAS kecil**.
- Data historis: **diimpor semua**.

---

## 1. Arsitektur target

```
GitHub repo (ar-workspace)  ──push──▶  Vercel (Next.js, preview per PR, prod = main)
                                          │
                                          ├─ Supabase Auth (Google, hd=penguin.id)
                                          ├─ Supabase Postgres (RLS on semua tabel)
                                          ├─ Supabase Storage (tanda-terima, ltkp, uploads)
                                          ├─ Supabase Realtime (ganti Firebase RTDB)
                                          └─ GAS "mail-relay" (1 doPost, shared-secret) → GmailApp billing@penguin.id
```

- **Stack:**
  - Next.js 15 (App Router, TypeScript)
  - `@supabase/ssr`
  - Tailwind + tema token Google Workspace dark, sesuai `Halaman Utama/Design.md` dan `AppShellStyle.html`
  - TanStack Table, ECharts (`echarts-for-react`, supaya option Presentasi bisa dipakai ulang)
  - SheetJS (`xlsx`), `pdfjs-dist`, `pdf-lib`, Zod
- **Aturan parsing file:** semua parsing file (CSV/XLSX/PDF/XML) dijalankan **di browser atau Web Worker**, karena batas body request Vercel 4,5 MB. Browser hanya mengirim baris hasil parsing ke Supabase lewat Server Action/RPC. Pola ini sama dengan yang sekarang, jadi logikanya bisa dipindah hampir apa adanya.
- **Import idempotent** (pola yang sudah dipakai semua modul): satu RPC Postgres per jenis import menjalankan `delete by (tanggal/bulan/key) + insert` dalam satu transaksi, lalu mencatat ke `import_log`.
- **HTML→PDF:** Billing sekarang memakai konverter Google. Rencananya:
  - Render PDF di browser (`html2canvas` + `jsPDF`, atau `@react-pdf/renderer` untuk layout tagihan).
  - Kirim PDF itu sebagai base64 ke mail-relay.
  - Alternatif: mail-relay tetap menerima `kind:'html'` dan mengonversi di GAS seperti sekarang. **Ini jalur tercepat untuk fase awal.**

### Struktur repo
```
app/(auth)/login
app/(shell)/layout.tsx          ← sidebar dari MENU_REGISTRY + ACL
app/(shell)/dashboard/{collection,mitra10,tukar-faktur}
app/(shell)/collection/[name]
app/(shell)/tukar-faktur/{jadwal,upload}      app/kurir/  (mobile, light theme)
app/(shell)/faktur/{pengajuan,list,hold,ltkp}
app/(shell)/billing        app/(shell)/cek-harga    app/(shell)/coretax
app/(shell)/marketplace    app/(shell)/mitra10      app/(shell)/mutasi-bank
app/(shell)/presentasi     app/(shell)/pengaturan/{akun,acl,wa-template,update-tagihan,database}
lib/parsers/  (util tanggal/angka gabungan: ToDate2/ToNumber VBA + rawDate_/rawNum_ Presentasi)
lib/modules/<modul>/  (logika murni per modul, di-port dari JS/GAS/VBA)
supabase/migrations/*.sql   supabase/seed/   scripts/import-legacy/
gas/mail-relay/Code.gs
```

---

## 2. Skema database (ringkas, per domain)

**Inti & akses**
- `profiles(user_id, email, display_name, kind['sa','ctrl','coll','kurir'], role, collection_name)`
- `menu_acl(user_id, submenu_id)`. ID submenu memakai ID `MENU_REGISTRY` yang sudah ada (`dash.coll`, `tukar.upload`, …), deny-by-default; `'*'` untuk Super Admin.
- `app_settings(key, value jsonb)`: WA template, tax_name Mitra10, toleransi marketplace, `last_tagihan_update`.
- `import_log(id, module, kind, file_name, months text[], rows, user_id, at)`
- Fungsi `has_menu(submenu_id)` dipakai di policy RLS.

**Master AR bersama.** Menggantikan `Update_Tagihan`, `Invoice`, `Tagihan`, invoice/payment Mutasi, input Presentasi, dan aging Mitra10:
- `business_partners(key_no PK, search_key, name, payment_group, pic_ar, sales_agent, payment_term, marketing_group, customer_type, credit_limit, region, branch, first_sale, last_sale)`
- `ar_invoices(invoice_no PK, bp_key, payment_group, marketing, collection_name, invoice_date, due_date, amount, no_po, no_sj, branch, payment_term)`
- `ar_open_snapshot(as_of, invoice_no, open_amt, …)` untuk aging per upload. Status "Lunas" = invoice yang hilang dari snapshot berikutnya (logika Mitra10).
- `ar_payments(invoice_no, payment_doc, payment_date, amount)`, dengan UNIQUE(invoice_no, payment_doc).

**Collection (Aplikasi Utama)**
- `notes`: kategori enum Janji Bayar/Reminder/No Respon/Case/Administratif; kolom `done`, `closed_by`, `closed_at`, `created_at`, `created_by`.
- `payment_promises`, `contacts(bp PK, nama, no_wa)`
- `invoice_exchanges(invoice_no, metode[Kolektor,Ekspedisi,Sistem,WA,Email], tanggal, kode, resi, foto_path, kurir)`
- Realtime aktif untuk `notes` dan `ar_open_snapshot`.

**Tukar Faktur**
- `couriers`, `courier_schedules` (menggantikan Jadwal), `courier_updates` (menggantikan Update; status Done/Pending, kode, `photo_path`)
- Tidak perlu lagi sinkronisasi manual ke sheet utama: `invoice_exchanges` metode Kolektor cukup berupa **view** di atas `courier_updates`.

**Faktur Pajak**
- `tax_invoice_requests` (enum request/reason persis seperti sekarang), `tax_invoice_holds`, `ltkp_documents(no_ltkp, storage_path)`

**Billing**
- `billing_email_recipients`, `billing_filter_criteria`, `billing_email_history`, `billing_invoice_sent`
- Draft dan template email: pindah dari localStorage ke tabel per user.

**Cek Selisih Harga**
- `so_master` (dengan `no_po_clean` dan `is_manual` untuk suffix `-REV`)
- `po_so_cases`: status archived/completed, sehingga ARSIP dan TASK_COMPLETE jadi satu tabel.
- RPC `get_so_pivot(keys text[])`.

**XML CoreTax**
- `coretax_batches`, `coretax_invoices`, `coretax_items`: semua ID/NPWP bertipe `text`; `numeric(18,2)` untuk angka.
- `coretax_delete_list`
- View `coretax_tax_per_invoice`.

**MarketPlace**
- `mp_reports(report_id PK)`, dan tabel anak dengan ON DELETE CASCADE: `mp_orders` (biaya disimpan sebagai `fees jsonb`), `mp_items`, `mp_seller_fees`, `mp_adjustments`, `mp_shipping_discrepancies`, `mp_withdrawals`, `mp_balance_txns`, `mp_erp_rows`.

**Mitra10**
- `m10_worksheet(no_sj unique, …)`, `m10_gr(UNIQUE gr_no,item_code; sj_no)`, `m10_kwitansi(invoice_no unique)`
- Aging Mitra10 = filter `ar_open_snapshot` berdasarkan tax_name.

**Mutasi Bank**
- `bank_accounts` (seed 4888/0780/9797/3309/3435), `bank_mutations`, `collection_targets(month, invoice_no, open_amt)`
- View `v_mutasi_daily(month)`: `generate_series` + window SUM kumulatif, dipotong di `current_date`.

**Presentasi**
- `metric_values(key, ym, layer[manual,raw,excel], value)` + view resolusi prioritas (manual > raw > excel)
- `bp_sales_month`, `bp_aging_month`, `bp_payment_month`, `manual_rows(table_name, ym, data jsonb)`, `slide_texts`

**Storage buckets** (privat, akses lewat signed URL): `tanda-terima`, `ltkp`, `efaktur`, `uploads`.

---

## 3. Fase pengerjaan

**Fase 0 — Fondasi (±1 minggu)**
1. Buat project Supabase baru "ar-workspace" di ap-southeast-1 (`create_project`).
2. Buat repo GitHub `ar-workspace`; scaffold Next.js; hubungkan ke project Vercel **baru**. Project Vercel yang sudah ada (`fncjbs`, `distribusi-invoice`, …) tidak disentuh.
3. Aktifkan Google OAuth di Supabase dengan batasan `hd=penguin.id`, plus trigger `on auth.users insert` yang menolak domain lain.
   - Pengecualian: allowlist email untuk kurir yang tidak punya akun penguin.id.
4. Buat App Shell: login, sidebar dari `MENU_REGISTRY` (port dari `Halaman Utama/Aplikasi Utama/AppShellScript.html`), guard ACL, token tema.
5. Migrasi SQL inti: `profiles`, `menu_acl`, `app_settings`, `import_log`, master AR, RLS.
6. Env vars di Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MAIL_RELAY_URL`, `MAIL_RELAY_SECRET`.

**Fase 1 — AR Collection inti** (paling sering dipakai; menggantikan Firebase)
- Halaman Pengaturan → Update Tagihan: port `processExcelUpload`, termasuk aturan kolom Blank_A4, filter marketing, dan tanggal > 01/01/2026.
- Tabel collection: filter, chips, bulk action, WA `wa.me`, lacak TIKI, export.
- Catatan dan janji bayar dengan Supabase Realtime.
- Dashboard controller: port `getSpvSummary` jadi SQL view/RPC.
- Kontak dan WA template.
- Dashboard Mitra10 (view).
- Pengaturan akun dan ACL.

**Fase 2 — Tukar Faktur + Faktur Pajak**
- App kurir mobile (`/kurir`): kompres foto di browser, upload ke Storage `tanda-terima`, submit transaksional.
- Upload jadwal: merge master CSV + aging.
- Dashboard tukar faktur.
- Pengajuan pembatalan/revisi, list + upload LTKP ke Storage, Hold, pencarian dan preview LTKP.

**Fase 3 — Modul upload/analitik** (logika sebagian besar sudah di browser, jadi port relatif langsung)
- **Cek Selisih Harga:** logika parsing dan rekonsiliasi dari `Cek Selisih Harga/Index.html`.
- **XML CoreTax:** parser DOMParser dan `genXML` dari `XML CoreTax/index.html`, apa adanya.
- **MarketPlace:** `buildRecon`, `buildAudit`, `buildErpRecon`, `SHOPEE_COLS`/`TIKTOK_COLS` dari `MarketPlace/index.html`. Grafik diganti ECharts; opsi lain Chart.js via `react-chartjs-2`.

**Fase 4 — Billing**
- Port parser CSV/PDF, `buildModel`, `renderCustomer`, dan merge pdf-lib dari `Billing/javascript.html` ke komponen React.
- Kriteria filter, history, dan recipients ke DB.
- **GAS mail-relay:** `doPost` memverifikasi `MAIL_RELAY_SECRET`, lalu memanggil `GmailApp.sendEmail` dengan alias. Kodenya diambil dari `sendTagihanEmail` dan `htmlToPdfBase64` di `Billing/Code.gs`, dan dipanggil lewat Next.js Route Handler (supaya secret tidak ada di browser).
- Riwayat pengiriman ditulis ke Supabase, bukan ke Sheets.

**Fase 5 — Konversi macro Excel**
- **Mutasi Bank:**
  - Port `mdlParse.bas` (NormHeader, FindHeaderRow, ToNumber, ToDate2) ke `lib/parsers`.
  - Port aturan import di `mdlImport.bas`: CR saja, abaikan "switching penguin", replace per tanggal periode, header `Periode :`.
  - Dashboard harian dan kumulatif dari `mdlDashboard.bas`.
  - Unduhan template XLSX.
- **Mitra10:**
  - Port `modAging`, `modGR` (CleanSJ `SJ/00123/XXVI/TRA`), `modKwitansi`.
  - ⚠ **Formula Kertas Kerja, kolom `Check` GR, dan Dashboard hanya ada di `VBA Mitra10 Tukar Faktur.xlsm`.** Langkah pertama fase ini: ekstrak formula workbook itu (openpyxl, read-only) dan dokumentasikan sebelum di-port ke SQL view.

**Fase 6 — Presentasi (AR Management Deck)**
- `js/core`, `js/data/parse.js`, `state.js`, `js/engine/metrics.js`, `insights.js` diubah jadi modul TS. Logikanya tetap, hanya ditambah `export`/`import`.
- UI slide ditulis ulang sebagai komponen React; option ECharts dipakai ulang; `drawer` menjadi renderer "section JSON".
- Sumber data berganti dari IndexedDB ke tabel Supabase (bentuk `state` direkonstruksi dari query).
- Export PDF lewat `window.print` tetap.

**Fase 7 — Migrasi data historis & cutover**
- `scripts/import-legacy/`: script Node yang membaca export XLSX/CSV dari tiap spreadsheet dan workbook, lalu insert ke Supabase dengan service role. Cakupannya:
  - Catatan, Janji Bayar, Kontak, Tukar Faktur/Ekspedisi/Sistem/WA/Email
  - Jadwal, Update, Kurir
  - Pengajuan, Hold Faktur
  - Sheet Billing: EmailDB, KriteriaFilter, HistoryEmail, InvoiceTerkirim
  - MASTER, ARSIP, TASK_COMPLETE
  - TaxInvoices
  - Sheet MUT_*, Invoice, Payment, Target
  - Sheet Mitra10
  - Snapshot Presentasi (`.json`)
  - Foto Drive "Tanda Terima" dan PDF LTKP → Storage (Drive API, atau GAS export sekali jalan)
- Karena `spreadsheet ID` tidak ada di kode (semua script bound), ID setiap sheet perlu diambil dari container project GAS (script ID tercatat di tiap `.clasp.json`).
- Cutover per modul:
  1. Jalankan paralel sekitar 1 minggu.
  2. Freeze sheet lama menjadi read-only.
  3. Delta import terakhir.
  4. Ganti link.
  5. Nonaktifkan deployment GAS lama, kecuali mail-relay.

---

## 4. Perbaikan keamanan yang otomatis didapat
- PIN diganti Google login; ACL deny-by-default ditegakkan di **server dan RLS**, bukan hanya di UI.
- Admin secret Firebase dan Firebase RTDB dihapus seluruhnya.
- Upload Tukar Faktur dan halaman Pembatalan sekarang wajib login; field audit `email` terisi dari `auth.uid()`.
- Storage privat dengan signed URL. Sekarang, file LTKP dan foto di-share "anyone with link".
- Guard formula injection (`sanitizeCell_`) tidak diperlukan lagi di DB, tetapi tetap diterapkan saat export XLSX.

---

## 5. Verifikasi
- **Parity test engine:** port asersi "golden number" dari `Presentasi/tools/build-snapshot.js` (misalnya TOP Sep = 63.158.053.929, open Agustus = 139.959.208.348, rata-rata telat Agustus = 1,21) ke Vitest, dan jalankan di GitHub Actions.
- **Unit test parser dengan file sampel yang sudah ada di repo:** `Billing/testing billing.csv`, `Data Pelengkap.csv`, `Cek Selisih Harga/template SO*.xlsx`, `PO RKM.xlsx`, dua file XML CoreTax (80 dan 79 faktur; cek jumlah faktur, jumlah item 178, dan XML hasil round-trip identik).
- **Perbandingan data:** setelah import legacy, bandingkan total per sheet dengan query SQL (jumlah baris, Σ open_amt, Σ selisih, Σ mutasi per rekening per bulan) terhadap angka di Sheets/Excel.
- **Supabase:** jalankan `get_advisors` (security dan performance) setelah setiap migrasi. Target: tidak ada tabel tanpa RLS.
- **Vercel:** setiap PR menghasilkan preview deployment. Uji E2E manual per modul dengan 3 akun uji (SA, controller, collection) untuk memastikan ACL; cek `get_runtime_logs` bila ada error.
- **Mail-relay:** kirim email uji ke alamat internal, lalu cek lampiran PDF tagihan + FP dan alias pengirim.
- **Realtime:** dua browser membuka collection yang sama; catatan dari satu browser harus muncul di browser lain tanpa reload.

---

## 6. Eksekusi Fase 0 — langkah konkret (disetujui user 2026-09-25)

Keputusan yang sudah diambil:
- Repo GitHub: `https://github.com/jbsfnc123/arfinance.git` (sudah dibuat oleh user).
- Folder lokal: `C:\Users\dearmando.manalu_pen\dev\ar-workspace`, di luar OneDrive.
- Nama project Supabase dan Vercel: `arfinance`.
- Organisasi Supabase: `jbsfnc123's Org` (id `hmoqocuckywsdgnjosvr`, paket free; 3 project lama sedang pause, jadi kuota project aktif tersedia).
- Tools yang ada: git 2.55, node 24, npm 11, clasp 3.3. Tidak ada gh, supabase CLI, atau vercel CLI. Karena itu Supabase dan Vercel dikerjakan lewat MCP, dan GitHub lewat `git push` (Git Credential Manager).

Langkah:
1. **Supabase:** `create_project(name="arfinance", region="ap-southeast-1", organization_id="hmoqocuckywsdgnjosvr")`. Tunggu sampai status `ACTIVE_HEALTHY` (`get_project`), lalu ambil URL dan publishable key (`get_project_url`, `get_publishable_keys`).
2. **Scaffold** di `C:\Users\dearmando.manalu_pen\dev\ar-workspace`:
   - `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm`
   - Install dependency: `@supabase/ssr @supabase/supabase-js zod`
   - Install dev dependency: `vitest`
3. **File fondasi:**
   - `lib/supabase/{client,server,middleware}.ts` dan `middleware.ts`: refresh sesi, redirect ke `/login` bila belum login.
   - `app/(auth)/login/page.tsx`: tombol "Masuk dengan Google" (`signInWithOAuth`, `queryParams: { hd: 'penguin.id' }`).
   - `app/auth/callback/route.ts`
   - `lib/menu.ts`: port `MENU_REGISTRY` dari `Halaman Utama/Aplikasi Utama/AppShellScript.html`, dengan ID submenu yang sama.
   - `app/(shell)/layout.tsx` (sidebar 268px dan topbar 60px) dan `app/(shell)/page.tsx` (beranda).
   - Halaman placeholder "Segera hadir" untuk setiap menu yang belum di-port.
   - `app/globals.css`: token warna Workspace dark dari `AppShellStyle.html` (`--bg #1f1f1f`, `--surface #2d2d2d`, `--accent #8ab4f8`, …) dan font Google Sans/Roboto.
   - `.env.local.example`, `README.md` berisi cara setup.
4. **Migrasi SQL** `supabase/migrations/0001_core.sql` (disimpan di repo dan diterapkan via `apply_migration`):
   - Tabel `profiles`, `menu_acl`, `app_settings`, `import_log`, `email_allowlist`.
   - Trigger `handle_new_user` pada `auth.users`: menolak email di luar `@penguin.id` kecuali yang ada di `email_allowlist`; membuat baris `profiles`. Email user sendiri (`jobforkids@gmail.com`) dimasukkan ke allowlist sebagai Super Admin awal.
   - Fungsi `is_sa()` dan `has_menu(text)` (security definer). RLS aktif di semua tabel.
   - Lalu `generate_typescript_types` untuk menghasilkan `lib/database.types.ts`, dan `get_advisors(security)`.
5. **Git:**
   - `git init -b main`, `.gitignore` (node_modules, .next, .env*).
   - Commit awal, `git remote add origin https://github.com/jbsfnc123/arfinance.git`, `git push -u origin main`.
6. **Vercel:**
   - `create_git_project` bernama `arfinance` yang terhubung ke repo `jbsfnc123/arfinance`, framework nextjs.
   - `create_project_env`: `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` untuk production dan preview.
   - Pantau deployment pertama (`list_deployments`, `get_deployment`).
7. **Verifikasi Fase 0:**
   - `npm run build` sukses secara lokal.
   - Deployment Vercel berstatus READY, dan URL-nya menampilkan halaman login.
   - `get_advisors` tidak menemukan tabel tanpa RLS.

**Langkah yang harus dikerjakan user secara manual** (tidak bisa dilakukan lewat MCP):
- Google Cloud Console: buat OAuth Client ID (Web). Authorized redirect URI: `https://<ref>.supabase.co/auth/v1/callback`.
- Supabase Dashboard → Auth → Providers → Google: isi Client ID dan Secret.
- Supabase Dashboard → Auth → URL Configuration: Site URL = domain Vercel, lalu tambahkan `http://localhost:3000/**` dan `https://*-jbsfnc123*.vercel.app/**` ke Redirect URLs.
- Bila `git push` meminta login GitHub, selesaikan di jendela Git Credential Manager.
- Bila Vercel belum punya akses GitHub App ke repo `arfinance`, beri izin di pengaturan GitHub → Vercel.

Setelah Fase 0 selesai: lanjut ke Fase 1 (AR Collection) di branch `feat/collection`, dengan PR dan preview Vercel.

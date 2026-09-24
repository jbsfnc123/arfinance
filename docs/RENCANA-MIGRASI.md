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
- Login: **PIN 6 digit** saja. Keputusan 2026-09-25 menggantikan Google OAuth; detailnya di §7.
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

### Status Fase 0 (2026-09-25)
- ✅ Supabase `arfinance` (ref `knytaubhwnahnpamkhgz`) dengan migrasi 0001 dan 0002 diterapkan; advisor security bersih.
- ✅ Kode di-push ke `jbsfnc123/arfinance` (main).
- ✅ Vercel dibuat manual oleh user karena connector mendapat 403. Domain: **https://arfinance-eight.vercel.app**. Sudah dicek: `/` → 307 ke `/login`, dan `/login` → 200 dengan halaman login tampil.
- ❌ **Langkah Google OAuth di bawah DIBATALKAN.** User memilih login PIN (lihat §7). Bagian berikut disimpan hanya sebagai arsip.
- (arsip) Langkah 2: Google Cloud Console → OAuth Client ID (Web application):
  - Authorized JavaScript origins: `https://arfinance-eight.vercel.app`, `http://localhost:3000`
  - Authorized redirect URI: `https://knytaubhwnahnpamkhgz.supabase.co/auth/v1/callback`
  - OAuth consent screen: tipe **Internal** bila project Google Cloud berada di bawah Workspace penguin.id. Tipe Internal tidak mengizinkan akun @gmail.com; karena Super Admin awal adalah jobforkids@gmail.com, pilih **External** (mode Testing, tambahkan email sebagai test user) atau ganti Super Admin ke akun @penguin.id.
- ⏳ Langkah 3 (user): Supabase Dashboard:
  - Auth → Providers → Google: aktifkan, isi Client ID dan Secret.
  - Auth → URL Configuration:
    - Site URL = `https://arfinance-eight.vercel.app`
    - Redirect URLs: `https://arfinance-eight.vercel.app/**`, `https://arfinance-*.vercel.app/**` (preview), `http://localhost:3000/**`

---

## 7. Login PIN 6 digit (menggantikan Google OAuth) — keputusan user 2026-09-25

### Context
User tidak mau memakai OAuth. Yang diinginkan:
- Login cukup dengan **PIN 6 digit**, tanpa username.
- Setiap PIN **melekat pada satu role**.
- Hanya **Super Admin** yang bisa mengatur PIN dan role.
- PIN Super Admin: `060814`.

Keputusan tambahan dari user:
- Hak akses menu diatur **per role**, bukan per akun.
- **Semua akun, termasuk Collection, wajib memakai PIN.** Data yang dilihat akun Collection dibatasi ke `collection_name` miliknya.

### Desain
Supabase Auth tetap dipakai di belakang layar, supaya sesi cookie dan RLS berbasis `auth.uid()` tidak berubah:
- Setiap akun = 1 user Supabase Auth dengan email sintetis `<uuid>@pin.arfinance.local`.
- Password akun = `HMAC-SHA256(PIN_AUTH_SECRET, user_id)`, yang hanya diketahui server. User tidak pernah melihat password ini.
- **PIN disimpan sebagai `HMAC(pin, pepper)` di `profiles.pin_hash`**, dengan UNIQUE index, sehingga PIN otomatis unik dan bisa dicari tanpa username.
  - Pepper dibuat acak oleh migrasi di `private.config`. Nilainya tidak ada di repo.
- Karena ruang PIN hanya 1 juta kombinasi, ada **proteksi brute-force** di fungsi `pin_login`:
  - Maksimal 5 PIN salah per IP dalam 15 menit.
  - Maksimal 50 PIN salah secara global dalam 10 menit. Setelah itu login dikunci sementara.
  - Semua percobaan dicatat di `private.login_attempts`.

**Alur login:**
1. User mengetik 6 digit PIN.
2. Server action memanggil RPC `pin_login(pin, ip)` memakai service role.
3. RPC mengembalikan `user_id` bila cocok.
4. Server memanggil `signInWithPassword(email sintetis, password turunan)` lewat klien SSR, sehingga cookie sesi terpasang.

**Pengamanan pembuatan akun:** trigger `before insert` pada `auth.users` menolak user yang tidak punya `app_metadata.provisioned = true`. Nilai itu hanya bisa diset lewat Admin API, jadi pendaftaran publik lewat anon key tertutup.

### Migrasi `supabase/migrations/0003_pin_auth.sql`
**Dihapus:**
- `email_allowlist`
- trigger `on_auth_user_created` dan fungsi `handle_new_user`
- `menu_acl`, diganti `role_menus`
- kolom `profiles.kind` dan `profiles.role`

**Dibuat:**
- `public.roles(id uuid, name text unique, kind text check in ('sa','ctrl','coll','kurir'))`. Seed: Super Admin (sa), Manager (ctrl), Supervisor (ctrl), Collection (coll), Kurir (kurir).
  - `kind` menentukan syarat menu (`needs`) dan cakupan data. Contoh: `coll` hanya melihat data `collection_name` miliknya (dipakai di Fase 1).
- `public.role_menus(role_id, submenu_id)`. Super Admin melihat semua menu tanpa perlu entri.
- Kolom baru `profiles.role_id` (FK ke `roles`) dan `profiles.pin_hash` (unique). `display_name` wajib diisi.
- `private.config`: pepper, dengan `gen_random_bytes(32)` dari pgcrypto.
- `private.pin_hash(text)`
- `private.login_attempts(ip, success, at)`

**Fungsi:**
- `public.pin_login(p_pin text, p_ip text) returns jsonb` → `{status:'ok'|'invalid'|'locked', user_id, email}`. Security definer; EXECUTE hanya untuk `service_role`.
- `public.admin_set_pin(p_user uuid, p_pin text)`: security definer, dengan cek `private.is_sa()` di dalamnya. Format harus `^\d{6}$`. Pelanggaran unique menghasilkan pesan "PIN sudah dipakai akun lain".
- `private.is_sa()`, `private.has_menu()`, `private.my_kind()` dan `private.my_collection()` ditulis ulang supaya membaca `roles` dan `role_menus`.
- RLS untuk `roles` dan `role_menus`: semua yang login bisa membaca; hanya Super Admin yang bisa menulis.

### Kode
**Baru:**
- `lib/supabase/admin.ts`: klien service role, dengan `import "server-only"`.
- `lib/auth/pin.ts`: `derivePassword(userId)` dan `isValidPin()`.
- `app/login/page.tsx`: layar PIN dengan 6 kotak digit dan keypad angka (ramah layar sentuh untuk kurir). Submit otomatis saat digit ke-6 terisi. Pesan "PIN salah" atau "Terlalu banyak percobaan, coba lagi dalam 15 menit".
- `app/login/actions.ts`: server action `loginWithPin`. IP diambil dari header `x-forwarded-for`.
- `app/(shell)/pengaturan/akun/`: halaman dan server actions untuk Super Admin:
  - daftar akun (nama, role, collection name, aktif)
  - tambah akun (nama, role, collection name, PIN) lewat `auth.admin.createUser` dengan `app_metadata.provisioned=true`, lalu insert profil dan set PIN
  - reset PIN, ganti role, nonaktifkan
  - PIN tidak pernah ditampilkan ulang
- `app/(shell)/pengaturan/acl/`: tambah, ubah, atau hapus role, dan matriks role × menu berupa centang, dengan daftar menu dari `MENU_REGISTRY`.
- `scripts/create-account.mjs`: membuat akun Super Admin pertama lewat Admin API, dijalankan lokal dengan `.env.local`. PIN diberikan sebagai argumen, jadi `060814` **tidak pernah ditulis ke repo**.
- Tes vitest: `derivePassword` deterministik dan berbeda per user; validasi format PIN; akses menu per role.

**Diubah:**
- `lib/session.ts`: profil di-join dengan `roles(kind, name)`; menu diambil dari `role_menus` berdasarkan `role_id`.
- `lib/menu.ts`: `Access.kind` berasal dari role. Label menu jadi "Akun & PIN" (`set.akun`) dan "Role & Akses Menu" (`set.acl`). `set.pin` tetap dihapus, karena hanya Super Admin yang mengatur PIN.
- `app/(shell)/layout.tsx`: menampilkan nama dan role.
- `README.md`, `.env.local.example`, dan `docs/RENCANA-MIGRASI.md` disesuaikan.

**Dihapus:** `app/login/login-button.tsx`, `app/auth/callback/route.ts`.

### Environment variables baru (server-only)
- `SUPABASE_SERVICE_ROLE_KEY`: **user menyalin** dari Supabase Dashboard → Project Settings → API Keys → `secret`/`service_role`. MCP tidak menyediakan kunci ini.
- `PIN_AUTH_SECRET`: 32 byte acak yang dibuat Claude, lalu ditulis ke `.env.local`.
- Keduanya perlu **ditambahkan user ke Vercel** (Settings → Environment Variables, Production + Preview), lalu redeploy.

### Urutan eksekusi
1. Tulis dan terapkan `0003_pin_auth.sql` (`apply_migration`), lalu `get_advisors` dan `generate_typescript_types`.
2. Tulis kode di atas, lalu `npm test`, `npm run lint`, `npm run build`.
3. User menempel `SUPABASE_SERVICE_ROLE_KEY` ke `.env.local` → Claude menjalankan `node scripts/create-account.mjs --name "Super Admin" --role "Super Admin" --pin 060814`.
4. Commit dan push ke `main`. Aplikasi belum dipakai siapa pun, jadi tidak perlu branch terpisah.
5. User menambahkan kedua env var di Vercel dan redeploy.

### Verifikasi
- `execute_sql`: akun Super Admin ada, `pin_hash` terisi (bukan plaintext), role = Super Admin.
- Lokal (`npm run dev`) dan di https://arfinance-eight.vercel.app:
  - Login dengan PIN 060814 → beranda dengan semua menu.
  - PIN salah → "PIN salah".
  - 5× salah → pesan terkunci, tercatat di `private.login_attempts`.
- Buat akun uji role Collection dan beri 1 menu lewat matriks role. Login dengan PIN-nya: hanya menu itu yang tampil, dan halaman `/pengaturan/akun` menolak aksesnya.
- `signUp` publik dengan anon key harus ditolak oleh trigger.
- `get_advisors` security: 0 temuan.

### Catatan keamanan untuk user
- PIN 6 digit tanpa username jauh lebih lemah dari OAuth. Rate limit mengurangi risiko, tetapi PIN tidak boleh dibagikan.
- PIN Super Admin `060814` sudah tertulis di percakapan ini. Sebaiknya diganti lewat halaman Akun & PIN setelah login pertama.

### Setelah §7 selesai
Mulai **Fase 1** di branch `feat/collection`:
- Migrasi `0004_ar_master.sql`: `business_partners`, `ar_invoices`, `ar_open_snapshot`, `notes`, `payment_promises`, `contacts`, `invoice_exchanges`, beserta RLS berdasarkan `private.has_menu()`, `private.my_kind()`, dan `private.my_collection()`.
- Port `processExcelUpload` dari `Halaman Utama/Aplikasi Utama/Script.html`.

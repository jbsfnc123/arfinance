# AR Workspace (arfinance)

Satu website pengganti aplikasi GAS dan macro Excel AR PT Penguin Trading:
AR Collection, Tukar Faktur, Faktur Pajak, Billing, Cek Selisih Harga, XML CoreTax,
Marketplace, Mutasi Bank, Mitra10, dan Presentasi AR.

Rencana dan urutan migrasi lengkap ada di [docs/RENCANA-MIGRASI.md](docs/RENCANA-MIGRASI.md).

## Stack

- **Next.js 16** (App Router). Middleware sekarang bernama `proxy.ts`, dan `cookies()`/`params` bersifat async. Baca `node_modules/next/dist/docs/` sebelum menulis kode.
- **Supabase** project `arfinance` (ref `knytaubhwnahnpamkhgz`, region Singapore): Auth Google, Postgres dengan RLS, Storage, Realtime.
- **Vercel**: deploy otomatis dari branch `main`, preview untuk setiap PR.

## Menjalankan lokal

```bash
cp .env.local.example .env.local   # isi URL dan publishable key
npm install
npm run dev      # http://localhost:3000
npm test         # vitest
npm run build
```

## Struktur

| Path | Isi |
|---|---|
| `proxy.ts`, `lib/supabase/*` | Klien Supabase dan refresh sesi; user yang belum login diarahkan ke `/login` |
| `lib/menu.ts` | Registry menu (ID submenu = kunci ACL, sama dengan aplikasi lama) |
| `lib/session.ts` | Profil user dan ACL per request |
| `app/(shell)/` | Layout sidebar/topbar; `[...slug]` = placeholder modul yang belum dimigrasi |
| `supabase/migrations/` | Skema database. Diterapkan berurutan; jangan ubah file yang sudah diterapkan, buat file baru |

## Akses

- **Login:** hanya Google. Email `@penguin.id` diterima otomatis; email lain harus ada di tabel `email_allowlist`.
- **Jenis akun (`profiles.kind`):**
  - `sa`: Super Admin, melihat semua menu.
  - `ctrl`: Controller.
  - `coll`: Collection.
  - `kurir`: Kurir.
  - `user`: default untuk akun baru.
- **Menu:** deny-by-default. Hak akses diatur per user di tabel `menu_acl` (kolom `submenu_id`).
- **Super Admin awal:** `jobforkids@gmail.com`, lewat `email_allowlist`.

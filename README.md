# AR Workspace (arfinance)

Satu website pengganti aplikasi GAS dan macro Excel AR PT Penguin Trading:
AR Collection, Tukar Faktur, Faktur Pajak, Billing, Cek Selisih Harga, XML CoreTax,
Marketplace, Mutasi Bank, Mitra10, dan Presentasi AR.

Rencana dan urutan migrasi lengkap ada di [docs/RENCANA-MIGRASI.md](docs/RENCANA-MIGRASI.md).

## Stack

- **Next.js 16** (App Router). Middleware sekarang bernama `proxy.ts`, dan `cookies()`/`params` bersifat async. Baca `node_modules/next/dist/docs/` sebelum menulis kode.
- **Supabase** project `arfinance` (ref `knytaubhwnahnpamkhgz`, region Singapore): Auth (login PIN), Postgres dengan RLS, Storage, Realtime.
- **Vercel**: deploy otomatis dari branch `main`, preview untuk setiap PR.

## Menjalankan lokal

```bash
cp .env.local.example .env.local   # isi URL, publishable key, service role key, PIN_AUTH_SECRET
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
| `lib/session.ts` | Profil, role, dan menu yang diizinkan per request |
| `lib/auth/`, `app/login/` | Login PIN |
| `app/(shell)/pengaturan/{akun,acl}` | Kelola akun dan PIN, role dan akses menu (khusus Super Admin) |
| `app/(shell)/` | Layout sidebar/topbar; `[...slug]` = placeholder modul yang belum dimigrasi |
| `supabase/migrations/` | Skema database. Diterapkan berurutan; jangan ubah file yang sudah diterapkan, buat file baru |

## Akses

- **Login:** PIN 6 digit saja, tanpa username.
  - Setiap PIN unik dan disimpan sebagai `HMAC(pin, pepper)` di `profiles.pin_hash`. Pepper ada di `private.config`.
  - Di belakang layar tiap akun adalah user Supabase Auth dengan email sintetis `<uuid>@pin.arfinance.local`. Password-nya diturunkan dari `PIN_AUTH_SECRET` (`lib/auth/pin.ts`).
  - Batas brute-force di `public.pin_login`: 5 PIN salah per IP per 15 menit, 50 PIN salah global per 10 menit.
- **Role (`roles.kind`):**
  - `sa`: Super Admin, semua menu, satu-satunya yang bisa mengatur akun, PIN, dan role.
  - `ctrl`: Controller.
  - `coll`: Collection. Data dibatasi ke `profiles.collection_name`.
  - `kurir`: Kurir.
- **Menu:** deny-by-default, diatur per role di tabel `role_menus`.
- **Akun baru:** hanya lewat halaman Pengaturan → Akun & PIN, atau lewat script. `signUp` publik ditolak trigger `guard_auth_signup`.
- **Akun Super Admin pertama:**
  ```bash
  node --env-file=.env.local scripts/create-account.mjs --name "Super Admin" --role "Super Admin" --pin <6digit>
  ```

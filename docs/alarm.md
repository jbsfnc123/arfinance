# Alarm sementara

## Penggunaan

- AR/AP: profil kanan atas → Alarm. Finance/Kolektor: tombol Alarm di area akun kanan atas.
- Super Admin: buka `Akses pengirim Alarm`, pilih akun, simpan. Super Admin selalu boleh mengirim.
- Semua akun aktif bisa menerima. Hanya pengirim berizin yang mendapatkan daftar penerima dan form kirim.
- Pilih penerima, tanggal (default hari ini), jam WIB, dan pesan (maksimum 2.000 karakter).
- Maksimal 20 alarm dalam satu sesi tab. Jadwal dapat dibatalkan sebelum dikirim.
- Modal terpusat menampilkan nama pengirim dan pesan. Beberapa pesan ditampilkan bergantian.

## Batasan yang disepakati

Browser pengirim dan penerima harus terbuka. Pesan, jadwal, status pengiriman, dan deduplikasi hanya di memori komponen: tidak ditulis ke Supabase, Storage, localStorage, sessionStorage, atau IndexedDB. Refresh, tutup tab, logout, dan perpindahan workspace menghapusnya. Navigasi halaman dalam workspace mempertahankan provider/layout. Perangkat tidur atau pembatasan browser bisa menunda pengiriman sampai tab berjalan lagi. Penerima offline tidak mendapat pengiriman ulang. Status `Dikirim ke saluran` berarti server Realtime menerima permintaan, bukan konfirmasi diterima/dibaca.

Pengaturan hak kirim saja disimpan di `app_settings`, key `alarm_senders_v1`, menggunakan kebijakan Super Admin yang sudah ada. Pembacaan izin dilakukan saat membuka panel dan setiap pengiriman, bukan polling database.

## Keamanan dan integrasi

Server actions memverifikasi sesi aktif dan izin terbaru. Nama/ID pengirim berasal dari sesi server, bukan payload browser. Hanya server yang menyiarkan via HTTP Broadcast privat. Tidak menggunakan SQL `realtime.send`, sebab cara SQL menyimpan pesan. Penerima berlangganan `alarm:<user-id>`; kebijakan SELECT membatasi ke akun sendiri yang aktif. Kebijakan INSERT restrictive melarang klien memalsukan broadcast. Isi pesan ditampilkan sebagai teks React, bukan HTML.

Implementasi terpisah di `lib/alarm/` dan `components/alarm/`. Empat berkas existing hanya menambahkan provider dan tombol. Tidak ada perubahan proses bisnis, impor, closing, cache Collection, atau skema tabel bisnis.

## Penerapan

1. Tinjau dan terapkan `supabase/migrations/20261006191613_ephemeral_alarm_access.sql` pada project arfinance sebelum mengaktifkan kode produksi.
2. Deploy commit PR Alarm.
3. Dengan dua akun uji: beri izin kirim, buka aplikasi penerima, jadwalkan pesan uji, pastikan modal tampil; cabut izin dan pastikan pengiriman berikutnya ditolak.
4. Uji akun ketiga tidak dapat berlangganan saluran penerima lain.
5. Verifikasi hanya key izin yang tersimpan, tanpa pesan/jadwal.

Rollback: deploy commit sebelumnya, lalu hapus tiga policy bernama `alarm_receive_own`, `alarm_topic_isolation`, `alarm_server_publish_only` dari `realtime.messages`. Jangan menghapus kebijakan fitur lain. Key izin boleh tetap ada agar konfigurasi tidak hilang.

## Validasi lokal

16 tes: model tanggal/jadwal, otorisasi server, kebijakan RLS menggunakan PGlite, dan komponen DOM dengan transport Realtime simulasi. Pengujian transport nyata dua akun masih memerlukan migrasi dan lingkungan aplikasi terkonfigurasi. Tidak ada pesan yang dikirim ke akun pengguna selama pengujian lokal.

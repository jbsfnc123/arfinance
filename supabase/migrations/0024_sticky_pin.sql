-- 0024: pin sticky notes (bersama untuk semua pengguna). null = tidak di-pin; isi = waktu di-pin.
alter table public.sticky_notes add column pinned_at timestamptz;

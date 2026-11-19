-- Rollback 20261119100000_cekharga_local (Fase 83): hapus RPC arsip otomatis. Isi po_so_cases tidak disentuh.
-- Catatan: aplikasi versi Fase 83 tidak lagi memakai so_master; rollback penuh juga perlu mengembalikan kode upload SO lama.
drop function if exists public.po_so_cases_archive(jsonb);

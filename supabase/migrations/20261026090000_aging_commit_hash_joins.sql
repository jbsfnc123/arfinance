-- Perbaikan upload Aging gagal "canceling statement due to statement timeout" (sejak 2026-10-23).
-- aging_commit berjalan sebagai role authenticated (statement_timeout 8 detik). Snapshot Aging baru belum punya statistik,
-- sehingga planner mengira data Aging hanya ±3 baris dan memilih nested loop: m10_append_from_aging memindai ulang daftar
-- Kertas Kerja Mitra10 5.865× (34 juta perbandingan, ±24 detik); total aging_commit ±38 detik.
-- Dengan nested loop dimatikan HANYA di dua fungsi ini, planner memakai hash join (tabelnya kecil, puluhan ribu baris):
-- total ±5 detik (diukur dalam transaksi yang di-rollback pada batch nyata 22.220 baris).
-- Rollback: alter function ... reset enable_nestloop;
alter function public.aging_commit(uuid) set enable_nestloop = off;
alter function private.m10_append_from_aging() set enable_nestloop = off;

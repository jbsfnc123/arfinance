-- Rollback 20261118120000_row_flags (Fase 82). Menghapus HANYA objek yang ditambahkan migrasi itu.
-- Catatan: tanda LTKP/Litigasi yang tersimpan ikut terhapus. Simpan dulu bila perlu:
--   select module, worksheet_id, flag, updated_by, updated_at from public.row_flags;
drop function if exists public.row_flags_set(text, bigint[], text);
drop function if exists public.pack_row_flags(text);
drop table if exists public.row_flags;          -- ikut: policy, trigger bump_version_row_flags, grant
delete from public.data_versions where key = 'row_flags';

-- Rollback 0040_row_marks (Fase 44). Menghapus HANYA objek yang ditambahkan migrasi 0040; data lain tidak disentuh.
-- Catatan: penanda warna yang tersimpan ikut terhapus. Simpan dulu bila perlu:
--   select module, worksheet_id, color, updated_by, updated_at from public.row_marks;
drop function if exists public.row_marks_set(text, bigint[], text);
drop function if exists public.pack_row_marks(text);
drop table if exists public.row_marks;          -- ikut: policy, trigger bump_version_row_marks, grant
delete from public.data_versions where key = 'row_marks';

-- Rollback 0042_monitor_sj (Fase 45). Menghapus HANYA objek modul Monitor Surat Jalan; tabel lain tidak disentuh.
-- PERHATIAN: riwayat upload & kejadian serah terima ikut terhapus. Simpan dulu bila perlu, mis.:
--   select * from public.sj_events;  select * from public.sj_batches;  select * from public.sj_receivers;
drop function if exists public.sj_receiver_save(bigint, text, boolean);
drop function if exists public.sj_upload_commit(bigint);
drop function if exists public.sj_upload_rows(bigint, integer, jsonb);
drop function if exists public.sj_upload_begin(text, text, integer, integer);
drop function if exists public.sj_events_of(text);
drop function if exists public.pack_sj();
drop function if exists private.sj_date(text);
drop table if exists public.sj_receiver_log;
drop table if exists public.sj_receivers;
drop table if exists public.sj_events;
drop table if exists private.sj_stage;
drop table if exists public.sj_batches;
drop function if exists private.sj_can_manage();
drop sequence if exists public.sj_publish_seq;
delete from public.data_versions where key = 'sj';
delete from public.import_log where module = 'sj';

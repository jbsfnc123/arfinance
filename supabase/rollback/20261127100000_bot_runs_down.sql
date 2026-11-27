-- Rollback Fase 93 (bot_runs + bucket bot-transit). Jalankan manual di SQL Editor bila perlu.
drop policy if exists "unggah transit bot" on storage.objects;
drop policy if exists "baca transit bot" on storage.objects;
drop policy if exists "hapus transit bot" on storage.objects;
-- Bucket hanya bisa dihapus bila kosong (hapus objeknya lewat Dashboard Storage dulu).
delete from storage.buckets where id = 'bot-transit';
drop function if exists public.bot_run_finish(bigint, text, jsonb, text, text);
drop function if exists public.bot_run_log(bigint, text);
drop function if exists public.bot_run_start(bigint, bigint);
drop function if exists public.bot_runs_recent(integer);
drop function if exists public.bot_run_cancel(bigint);
drop function if exists public.bot_run_dispatch_failed(bigint, text);
drop function if exists public.bot_run_request(jsonb, boolean, boolean);
drop function if exists private.bot_job_ok(jsonb);
drop table if exists public.bot_runs;

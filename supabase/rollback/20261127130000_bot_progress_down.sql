-- Rollback Fase 94 (progres bot). Jalankan manual di SQL Editor bila perlu. bot_runs_recent / bot_run_finish kembali ke
-- versi Fase 93 dengan menjalankan ulang bagian fungsinya dari 20261127100000_bot_runs.sql.
drop function if exists public.bot_run_progress(bigint, text, jsonb);
alter table public.bot_runs drop column if exists progress;

-- 0043: indeks FK sj_receiver_log.receiver_id (saran advisor "unindexed foreign keys" setelah 0042).
-- Rollback: ikut terhapus bersama tabel di supabase/rollback/0042_monitor_sj_down.sql, atau
--   drop index if exists public.sj_receiver_log_receiver_idx;
create index if not exists sj_receiver_log_receiver_idx on public.sj_receiver_log (receiver_id);

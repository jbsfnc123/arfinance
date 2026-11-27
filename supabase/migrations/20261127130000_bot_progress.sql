-- Fase 94 — Mitra10 › BOT: progres terstruktur run bot cloud (KPI live di Kertas Kerja).
-- Kolom bot_runs.progress (langkah aktif, akun i/n, done/total) dikirim runner lewat RPC baru bot_run_progress (bot_run_log
-- lama tetap ada → tidak ada overload ambigu). bot_runs_recent ikut mengirim progress; bot_run_finish mengosongkannya.
-- Tanpa DROP/DELETE. Rollback: supabase/rollback/20261127130000_bot_progress_down.sql.

alter table public.bot_runs add column if not exists progress jsonb;

create or replace function public.bot_run_progress(p_id bigint, p_log text, p_progress jsonb)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare v_status text;
begin
  if not private.is_system_account() then
    raise exception 'Akses ditolak: khusus akun bot' using errcode = '42501';
  end if;
  update public.bot_runs
     set log_tail = case when p_log is null then log_tail else right(p_log, 30000) end,
         progress = case when status = 'running' and p_progress is not null and octet_length(p_progress::text) < 4000 then p_progress else progress end
   where id = p_id returning status into v_status;
  return v_status;
end;
$$;
revoke execute on function public.bot_run_progress(bigint, text, jsonb) from public, anon;
grant execute on function public.bot_run_progress(bigint, text, jsonb) to authenticated;

create or replace function public.bot_runs_recent(p_limit integer default 20)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_menu('rek.mitra10') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.id desc) from (
      select r.id, r.jobs, r.dry_run, r.status, r.requested_at, r.started_at, r.finished_at, r.result, r.log_tail, r.error,
             r.progress, r.requested_by = auth.uid() as mine, coalesce(p.display_name, '-') as requested_name
        from public.bot_runs r left join public.profiles p on p.id = r.requested_by
       order by r.id desc limit least(greatest(coalesce(p_limit, 20), 1), 100)) x), '[]'::jsonb);
end;
$$;

create or replace function public.bot_run_finish(p_id bigint, p_status text, p_result jsonb, p_log text, p_error text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.is_system_account() then
    raise exception 'Akses ditolak: khusus akun bot' using errcode = '42501';
  end if;
  if p_status not in ('success', 'partial', 'failed', 'cancelled') then
    raise exception 'Status tidak valid' using errcode = '22023';
  end if;
  update public.bot_runs
     set status = case when status = 'cancelled' then 'cancelled' else p_status end,
         finished_at = now(), result = p_result, progress = null,
         log_tail = coalesce(right(p_log, 30000), log_tail),
         error = case when status = 'cancelled' then error else left(p_error, 1000) end
   where id = p_id and (status in ('queued', 'running') or (status = 'cancelled' and result is null));
end;
$$;

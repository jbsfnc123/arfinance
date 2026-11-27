-- Fase 93 — Mitra10 › BOT: antrean & status run bot cloud (GitHub Actions repo privat ARBOT) untuk 5 job EDI Mitra10.
-- AR Workspace meminta run (bot_run_request) → API route memicu workflow → runner (akun sistem Bot ERP) melapor
-- start / log / finish. Satu run aktif sekaligus. Bucket privat bot-transit = PDF faktur hanya transit selama run
-- (diunggah peminta, dibaca & dihapus bot). Tanpa DROP/DELETE data lama. Rollback: supabase/rollback/20261127100000_bot_runs_down.sql.

create table public.bot_runs (
  id           bigint generated always as identity primary key,
  jobs         jsonb not null,
  dry_run      boolean not null default false,
  status       text not null default 'queued' check (status in ('queued', 'running', 'success', 'partial', 'failed', 'cancelled')),
  requested_by uuid not null default auth.uid(),
  requested_at timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  gh_run_id    bigint,
  transit      boolean not null default false,
  result       jsonb,
  log_tail     text,
  error        text
);
comment on table public.bot_runs is 'Mitra10 BOT (Fase 93): permintaan & status run bot cloud EDI Mitra10.';
create index bot_runs_active on public.bot_runs (status) where status in ('queued', 'running');
alter table public.bot_runs enable row level security;
create policy "baca run bot mitra10" on public.bot_runs for select to authenticated using (private.has_menu('rek.mitra10'));
revoke all on public.bot_runs from anon, authenticated;
grant select on public.bot_runs to authenticated;

create or replace function private.bot_job_ok(p_jobs jsonb)
returns boolean
language sql immutable set search_path = ''
as $$
  select jsonb_typeof(p_jobs) = 'array' and jsonb_array_length(p_jobs) between 1 and 5
    and not exists (
      select 1 from jsonb_array_elements(p_jobs) j
      where jsonb_typeof(j) <> 'object'
         or coalesce(j->>'id', '') not in ('edi.gr', 'edi.kwitansi', 'edi.invoice-inbox', 'edi.outbox-invoice', 'edi.upload-faktur')
         or (j ? 'params' and jsonb_typeof(j->'params') <> 'object'));
$$;

-- Permintaan run oleh pengguna menu Mitra10. Run basi (queued > 30 mnt / running > 60 mnt) ditandai gagal dulu.
create or replace function public.bot_run_request(p_jobs jsonb, p_dry_run boolean default false, p_transit boolean default false)
returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare v_id bigint; v_active bigint;
begin
  if not private.has_menu('rek.mitra10') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if not private.bot_job_ok(p_jobs) or octet_length(p_jobs::text) > 2000000 then
    raise exception 'Permintaan job tidak valid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('public.bot_runs'));
  update public.bot_runs set status = 'failed', finished_at = now(),
         error = coalesce(error, 'Kedaluwarsa: bot tidak melapor')
   where (status = 'queued' and requested_at < now() - interval '30 minutes')
      or (status = 'running' and coalesce(started_at, requested_at) < now() - interval '60 minutes');
  select id into v_active from public.bot_runs where status in ('queued', 'running') order by id limit 1;
  if v_active is not null then
    raise exception 'Masih ada run BOT yang berjalan (#%). Tunggu sampai selesai atau batalkan.', v_active using errcode = 'P0001';
  end if;
  insert into public.bot_runs (jobs, dry_run, transit) values (p_jobs, coalesce(p_dry_run, false), coalesce(p_transit, false))
  returning id into v_id;
  return v_id;
end;
$$;

-- Pemicu gagal (API route): hanya peminta, hanya selagi queued.
create or replace function public.bot_run_dispatch_failed(p_id bigint, p_error text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  update public.bot_runs set status = 'failed', finished_at = now(), error = left(coalesce(p_error, 'Gagal memicu bot'), 500)
   where id = p_id and requested_by = auth.uid() and status = 'queued';
end;
$$;

-- Batalkan (pengguna menu Mitra10). Mengembalikan gh_run_id agar API route bisa membatalkan run GitHub.
create or replace function public.bot_run_cancel(p_id bigint)
returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare v_gh bigint;
begin
  if not private.has_menu('rek.mitra10') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  update public.bot_runs set status = 'cancelled', finished_at = now(), error = coalesce(error, 'Dibatalkan pengguna')
   where id = p_id and status in ('queued', 'running')
  returning gh_run_id into v_gh;
  return v_gh;
end;
$$;

-- Riwayat terbaru + nama peminta (untuk tab BOT).
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
             r.requested_by = auth.uid() as mine, coalesce(p.display_name, '-') as requested_name
        from public.bot_runs r left join public.profiles p on p.id = r.requested_by
       order by r.id desc limit least(greatest(coalesce(p_limit, 20), 1), 100)) x), '[]'::jsonb);
end;
$$;

-- ── Fungsi runner (akun sistem Bot ERP) ──────────────────────────────────────────────────────────────────────
create or replace function public.bot_run_start(p_id bigint, p_gh_run_id bigint)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare r public.bot_runs;
begin
  if not private.is_system_account() then
    raise exception 'Akses ditolak: khusus akun bot' using errcode = '42501';
  end if;
  update public.bot_runs set status = 'running', started_at = now(), gh_run_id = p_gh_run_id
   where id = p_id and status = 'queued' returning * into r;
  if r.id is null then
    select * into r from public.bot_runs where id = p_id;
    if r.id is null then raise exception 'Run % tidak ada', p_id using errcode = 'P0002'; end if;
    return jsonb_build_object('ok', false, 'status', r.status);
  end if;
  return jsonb_build_object('ok', true, 'status', r.status, 'jobs', r.jobs, 'dry_run', r.dry_run, 'transit', r.transit);
end;
$$;

-- Log berkala; mengembalikan status terkini (cancelled → runner berhenti).
create or replace function public.bot_run_log(p_id bigint, p_log text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare v_status text;
begin
  if not private.is_system_account() then
    raise exception 'Akses ditolak: khusus akun bot' using errcode = '42501';
  end if;
  update public.bot_runs set log_tail = right(coalesce(p_log, ''), 30000) where id = p_id returning status into v_status;
  return v_status;
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
         finished_at = now(), result = p_result,
         log_tail = coalesce(right(p_log, 30000), log_tail),
         error = case when status = 'cancelled' then error else left(p_error, 1000) end
   where id = p_id and (status in ('queued', 'running') or (status = 'cancelled' and result is null));
end;
$$;

revoke execute on function private.bot_job_ok(jsonb) from public, anon;
grant execute on function private.bot_job_ok(jsonb) to authenticated;
revoke execute on function public.bot_run_request(jsonb, boolean, boolean) from public, anon;
revoke execute on function public.bot_run_dispatch_failed(bigint, text) from public, anon;
revoke execute on function public.bot_run_cancel(bigint) from public, anon;
revoke execute on function public.bot_runs_recent(integer) from public, anon;
revoke execute on function public.bot_run_start(bigint, bigint) from public, anon;
revoke execute on function public.bot_run_log(bigint, text) from public, anon;
revoke execute on function public.bot_run_finish(bigint, text, jsonb, text, text) from public, anon;
grant execute on function public.bot_run_request(jsonb, boolean, boolean) to authenticated;
grant execute on function public.bot_run_dispatch_failed(bigint, text) to authenticated;
grant execute on function public.bot_run_cancel(bigint) to authenticated;
grant execute on function public.bot_runs_recent(integer) to authenticated;
grant execute on function public.bot_run_start(bigint, bigint) to authenticated;
grant execute on function public.bot_run_log(bigint, text) to authenticated;
grant execute on function public.bot_run_finish(bigint, text, jsonb, text, text) to authenticated;

-- ── Storage transit PDF faktur (privat) ──────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bot-transit', 'bot-transit', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

create policy "unggah transit bot" on storage.objects for insert to authenticated with check (
  bucket_id = 'bot-transit' and private.has_menu('rek.mitra10') and exists (
    select 1 from public.bot_runs r
     where r.id::text = (storage.foldername(name))[1] and r.requested_by = auth.uid() and r.status = 'queued' and r.transit));
create policy "baca transit bot" on storage.objects for select to authenticated using (
  bucket_id = 'bot-transit' and private.is_system_account());
create policy "hapus transit bot" on storage.objects for delete to authenticated using (
  bucket_id = 'bot-transit' and private.is_system_account());

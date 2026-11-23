-- Fase 86 — Monitor Surat Jalan: centang Business Partner & Area yang ditampilkan (bersama, semua user).
-- Hanya nilai yang pernah diubah yang tersimpan; BP/Area baru otomatis tampil. Mencentang kembali = hidden false
-- (update, bukan hapus). Hanya Controller/Super Admin (sj_can_manage) yang boleh mengubah. Tanpa DROP/DELETE.
-- Rollback: supabase/rollback/20261123100000_sj_hidden_down.sql.

create table public.sj_visibility (
  kind       text not null check (kind in ('bp', 'area')),
  value      text not null,
  hidden     boolean not null,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (kind, value)
);
comment on table public.sj_visibility is 'Monitor Surat Jalan (Fase 86): Business Partner / Area yang disembunyikan (tidak dicentang) dari Dashboard & Kertas Kerja.';
alter table public.sj_visibility enable row level security;
create policy "baca tampilan surat jalan" on public.sj_visibility for select to authenticated using (private.has_menu('tukar.monitor_sj'));
revoke all on public.sj_visibility from anon, authenticated;
grant select on public.sj_visibility to authenticated;
create trigger bump_version_sj_visibility after insert or update or delete or truncate on public.sj_visibility
  for each statement execute function private.bump_version('sj');

create or replace function public.sj_visibility_set(p_kind text, p_values text[], p_hidden boolean)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not private.sj_can_manage() then
    raise exception 'Akses ditolak: pengaturan hanya untuk Controller/Super Admin' using errcode = '42501';
  end if;
  if p_kind not in ('bp', 'area') or p_hidden is null then
    raise exception 'Data tidak valid' using errcode = '22023';
  end if;
  if cardinality(p_values) > 20000 then
    raise exception 'Terlalu banyak nilai (maks. 20.000)' using errcode = '22023';
  end if;
  insert into public.sj_visibility (kind, value, hidden, updated_by, updated_at)
  select distinct p_kind, v, p_hidden, auth.uid(), now()
  from unnest(coalesce(p_values, '{}')) v where nullif(trim(v), '') is not null
  on conflict (kind, value) do update
    set hidden = excluded.hidden, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  get diagnostics v_count = row_count;
  return jsonb_build_object('count', v_count);
end;
$$;
revoke execute on function public.sj_visibility_set(text, text[], boolean) from public, anon;
grant execute on function public.sj_visibility_set(text, text[], boolean) to authenticated;

create or replace function public.pack_sj()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_menu('tukar.monitor_sj') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'docs', private.pack('select sj_key, sj_no, tanggal_sj, area, business_partner, locator, send_date from public.sj_docs',
      array['sj_key', 'sj_no', 'tanggal_sj', 'area', 'business_partner', 'locator', 'send_date']),
    'receipts', private.pack('select sj_key, sj_no, receive_date, receiver, file_name, recorded_at from public.sj_receipts',
      array['sj_key', 'sj_no', 'receive_date', 'receiver', 'file_name', 'recorded_at']),
    'receivers', private.pack('select id, name, active from public.sj_receivers order by id', array['id', 'name', 'active']),
    'hidden', private.pack('select kind, value from public.sj_visibility where hidden', array['kind', 'value']),
    'log', private.pack('select l.at, l.action, l.old_name, l.new_name, coalesce(p.display_name, ''-'') as by_name
      from public.sj_receiver_log l left join public.profiles p on p.id = l.by_user order by l.at desc limit 50',
      array['at', 'action', 'old_name', 'new_name', 'by_name']),
    'uploads', private.pack('select i.at, i.file_name, i.rows, coalesce(p.display_name, ''-'') as uploader
      from public.import_log i left join public.profiles p on p.id = i.user_id where i.module = ''sj'' order by i.id desc limit 50',
      array['at', 'file_name', 'rows', 'uploader']),
    'docsAt', (select jsonb_build_object('file', file_name, 'at', at) from public.import_log where module = 'sj' order by id desc limit 1),
    'canManage', private.sj_can_manage());
end;
$$;

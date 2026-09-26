-- 0028: Fase 19 — checklist upload harian di Pusat Upload (status dari import_log).

-- Subjenis file (mis. ERP: invoice / payment — satu kind 'erp' untuk dua file berbeda).
alter table public.import_log add column detail text;

-- erp_commit: catat jenis file ERP (v_kind) di import_log.detail. Batch sudah dihapus sebelum log
-- ditulis, jadi disisipkan langsung ke pernyataan log (penggantian teks yang dicek, bukan salin ulang).
do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef('public.erp_commit(uuid)'::regprocedure) into v_def;
  v_new := replace(v_def,
    'insert into public.import_log (module, kind, file_name, months, rows, user_id, file_sha256)
  values (''data'', ''erp'', b.file_name, v_months, v_inv + v_pay, (select auth.uid()), b.sha256);',
    'insert into public.import_log (module, kind, file_name, months, rows, user_id, file_sha256, detail)
  values (''data'', ''erp'', b.file_name, v_months, v_inv + v_pay, (select auth.uid()), b.sha256, v_kind);');
  if v_new = v_def then
    raise exception 'erp_commit: pernyataan import_log tidak ditemukan';
  end if;
  execute v_new;
end $$;

-- Mitra10 Jadwal Bayar: ikut dicatat (tambah nama file).
drop function public.m10_schedule_upsert(jsonb);
create function public.m10_schedule_upsert(p_rows jsonb, p_file_name text default null)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not private.has_menu('rek.mitra10') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  insert into public.m10_payment_schedule (no_kw, spp, nilai_kw, tgl_tukar_faktur, jadwal_transfer, notes)
  select distinct on (trim(r.no_kw)) trim(r.no_kw), r.spp, coalesce(r.nilai_kw, 0), r.tgl_tukar_faktur, r.jadwal_transfer, r.notes
  from jsonb_to_recordset(p_rows) as r(no_kw text, spp text, nilai_kw numeric, tgl_tukar_faktur date,
    jadwal_transfer date, notes text)
  where nullif(trim(r.no_kw), '') is not null
  order by trim(r.no_kw)
  on conflict (no_kw) do update set spp = excluded.spp, nilai_kw = excluded.nilai_kw,
    tgl_tukar_faktur = excluded.tgl_tukar_faktur, jadwal_transfer = excluded.jadwal_transfer, notes = excluded.notes;
  get diagnostics v_count = row_count;
  insert into public.import_log (module, kind, file_name, rows) values ('mitra10', 'jadwal', p_file_name, v_count);
  return v_count;
end;
$$;
revoke execute on function public.m10_schedule_upsert(jsonb, text) from public, anon;
grant execute on function public.m10_schedule_upsert(jsonb, text) to authenticated;

-- Marketplace: laporan yang disimpan ikut dicatat.
create or replace function public.mp_save_report(p_report jsonb)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_id   text := p_report #>> '{meta,reportId}';
begin
  if not private.has_menu('rek.marketplace') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if v_id is null or v_id = '' then
    raise exception 'reportId kosong' using errcode = '22023';
  end if;

  insert into public.mp_reports (report_id, platform, username, dari, ke, data, updated_at, updated_by)
  values (v_id, p_report #>> '{meta,platform}', p_report #>> '{meta,username}',
          coalesce(p_report #>> '{meta,dari}', ''), coalesce(p_report #>> '{meta,ke}', ''),
          p_report, now(), (select auth.uid()))
  on conflict (report_id) do update set
    data = excluded.data, updated_at = now(), updated_by = excluded.updated_by;

  delete from public.mp_order_index where report_id = v_id;
  insert into public.mp_order_index (report_id, no, penghasilan)
  select v_id, o ->> 'no', sum(coalesce((o ->> 'penghasilan')::numeric, 0))
  from jsonb_array_elements(coalesce(p_report -> 'Orders', '[]'::jsonb)) o
  where coalesce(o ->> 'no', '') <> ''
  group by o ->> 'no';

  insert into public.import_log (module, kind, file_name, rows)
  values ('marketplace', 'report',
    concat_ws(' ', p_report #>> '{meta,platform}', p_report #>> '{meta,username}',
      nullif(concat_ws(' – ', nullif(p_report #>> '{meta,dari}', ''), nullif(p_report #>> '{meta,ke}', '')), '')),
    jsonb_array_length(coalesce(p_report -> 'Orders', '[]'::jsonb)));

  return v_id;
end;
$$;

-- Status upload terakhir per jenis file (untuk checklist Pusat Upload).
create or replace function public.upload_status()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (private.is_ctrl() or private.has_menu('set.update')) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('module', s.module, 'kind', s.kind, 'detail', s.detail, 'at', s.at,
      'file', s.file_name, 'by', p.display_name))
    from (
      select distinct on (module, kind, coalesce(detail, '')) module, kind, detail, at, file_name, user_id
      from public.import_log
      order by module, kind, coalesce(detail, ''), at desc
    ) s left join public.profiles p on p.id = s.user_id), '[]'::jsonb);
end;
$$;
revoke execute on function public.upload_status() from public, anon;
grant execute on function public.upload_status() to authenticated;

create index if not exists import_log_module_kind_at_idx on public.import_log (module, kind, at desc);

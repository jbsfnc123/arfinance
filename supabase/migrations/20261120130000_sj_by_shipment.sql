-- Fase 85 — Monitor Surat Jalan lepas dari Aging (keputusan user 2026-11-20).
-- * Sumber: "Laporan Serah Terima Surat Jalan By Shipment Date (NEW)" (AR Bot / upload manual). Daftar yang dipantau =
--   semua SJ ("SJ/…") yang pernah muncul di laporan (tabel sj_docs, terkumpul; tidak dihapus karena Aging).
-- * Penerimaan (sj_receipts) tidak lagi disaring dengan Aging; aturan lain tetap (Receiver aktif, tanggal valid,
--   insert-only — Receive Date yang sudah ada tidak ditimpa).
-- * Tanggal awal durasi = Tanggal SJ (dihitung di browser). Filter Area & Locator dari laporan.
-- Tanpa DROP/DELETE data. sj_aging_keys/sj_aging_info dibiarkan (tidak dipakai Monitor lagi).
-- Rollback: supabase/rollback/20261120130000_sj_by_shipment_down.sql.

-- ══ DOKUMEN SJ DARI LAPORAN ════════════════════════════════════════
create table public.sj_docs (
  sj_key           text primary key,          -- upper(trim(SJ No.))
  sj_no            text not null,
  tanggal_sj       date,
  area             text,
  business_partner text,
  locator          text,
  send_date        date,                      -- Send Date paling awal yang pernah terlihat
  file_name        text,
  first_seen_at    timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.sj_docs is 'Monitor Surat Jalan (Fase 85): satu baris per SJ dari Laporan Serah Terima By Shipment Date. Tidak bergantung pada Aging.';
create index sj_docs_tanggal_idx on public.sj_docs (tanggal_sj);
alter table public.sj_docs enable row level security;
create policy "baca dokumen surat jalan" on public.sj_docs for select to authenticated using (private.has_menu('tukar.monitor_sj'));
revoke all on public.sj_docs from anon, authenticated;
grant select on public.sj_docs to authenticated;
create trigger bump_version_sj_docs after insert or update or delete or truncate on public.sj_docs
  for each statement execute function private.bump_version('sj');

-- ══ PENERIMAAN (bersama) ═══════════════════════════════════════════
-- Simpan kandidat penerimaan: Receiver aktif + Receive Date valid; SJ yang sudah punya Receive Date tidak ditimpa.
-- Mengembalikan {sent, saved, existing, notRecognized, badDate}.
create or replace function private.sj_receipts_insert(p_rows jsonb, p_file text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_total integer; v_recv integer; v_date integer; v_new integer;
begin
  with r as (
    select distinct on (k) k as sj_key, coalesce(nullif(trim(d->>'sj_no'), ''), k) as sj_no,
           private.sj_date(d->>'receive_date') as receive_date,
           regexp_replace(trim(coalesce(d->>'receiver', '')), '\s+', ' ', 'g') as receiver
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) with ordinality e(d, ord)
    cross join lateral (select upper(trim(coalesce(d->>'sj_key', d->>'sj_no', ''))) as k) kk
    where k <> ''
    order by k, ord
  ), c as (
    select r.*, exists (select 1 from public.sj_receivers v where v.active and v.name_norm = lower(r.receiver)) as ok from r
  ), ins as (
    insert into public.sj_receipts (sj_key, sj_no, receive_date, receiver, file_name)
    select sj_key, sj_no, receive_date, receiver, p_file from c where ok and receive_date is not null
    on conflict (sj_key) do nothing
    returning 1
  )
  select (select count(*) from c), (select count(*) from c where not ok),
         (select count(*) from c where ok and receive_date is null), (select count(*) from ins)
  into v_total, v_recv, v_date, v_new;
  return jsonb_build_object('sent', v_total, 'saved', v_new, 'existing', v_total - v_recv - v_date - v_new,
    'notRecognized', v_recv, 'badDate', v_date);
end;
$$;
revoke execute on function private.sj_receipts_insert(jsonb, text) from public, anon, authenticated;

-- RPC lama (AR Bot versi sebelum Fase 85 / tampilan lama): tanpa filter Aging lagi; notInAging selalu 0.
create or replace function public.sj_receipts_apply(p_file_name text, p_rows jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_file text; v_res jsonb;
begin
  if not private.sj_can_manage() then
    raise exception 'Akses ditolak: upload hanya untuk Controller/Super Admin' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 60000 then
    raise exception 'Data tidak valid (maks. 60.000 baris)' using errcode = '22023';
  end if;
  v_file := left(coalesce(nullif(trim(p_file_name), ''), 'tanpa-nama.csv'), 200);
  v_res := private.sj_receipts_insert(p_rows, v_file);
  insert into public.import_log (module, kind, file_name, rows) values ('sj', 'csv', v_file, (v_res->>'saved')::int);
  return v_res || jsonb_build_object('notInAging', 0);
end;
$$;

-- ══ RPC BARU: laporan Serah Terima (dokumen + penerimaan), atomik ═══
create or replace function public.sj_report_apply(p_file_name text, p_docs jsonb, p_receipts jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_file text; v_docs integer; v_new integer; v_res jsonb;
begin
  if not private.sj_can_manage() then
    raise exception 'Akses ditolak: upload hanya untuk Controller/Super Admin' using errcode = '42501';
  end if;
  if jsonb_typeof(p_docs) <> 'array' or jsonb_typeof(p_receipts) <> 'array'
     or jsonb_array_length(p_docs) > 60000 or jsonb_array_length(p_receipts) > 60000 then
    raise exception 'Data tidak valid (maks. 60.000 baris)' using errcode = '22023';
  end if;
  v_file := left(coalesce(nullif(trim(p_file_name), ''), 'tanpa-nama.csv'), 200);

  with d as (
    select distinct on (k) k as sj_key, coalesce(nullif(trim(x->>'sj_no'), ''), k) as sj_no,
           private.sj_date(x->>'tanggal_sj') as tanggal_sj, nullif(trim(x->>'area'), '') as area,
           nullif(trim(x->>'business_partner'), '') as business_partner, nullif(trim(x->>'locator'), '') as locator,
           private.sj_date(x->>'send_date') as send_date
    from jsonb_array_elements(p_docs) with ordinality e(x, ord)
    cross join lateral (select upper(trim(coalesce(x->>'sj_key', x->>'sj_no', ''))) as k) kk
    where k <> ''
    order by k, ord
  ), up as (
    insert into public.sj_docs as s (sj_key, sj_no, tanggal_sj, area, business_partner, locator, send_date, file_name)
    select sj_key, sj_no, tanggal_sj, area, business_partner, locator, send_date, v_file from d
    on conflict (sj_key) do update set
      sj_no = excluded.sj_no,
      tanggal_sj = coalesce(excluded.tanggal_sj, s.tanggal_sj),
      area = coalesce(excluded.area, s.area),
      business_partner = coalesce(excluded.business_partner, s.business_partner),
      locator = coalesce(excluded.locator, s.locator),
      send_date = least(s.send_date, excluded.send_date),
      file_name = excluded.file_name,
      updated_at = now()
    returning (xmax = 0) as inserted
  )
  select count(*), count(*) filter (where inserted) into v_docs, v_new from up;

  v_res := private.sj_receipts_insert(p_receipts, v_file);
  insert into public.import_log (module, kind, file_name, rows) values ('sj', 'csv', v_file, v_docs);
  return v_res || jsonb_build_object('docs', v_docs, 'docsNew', v_new);
end;
$$;
revoke execute on function public.sj_report_apply(text, jsonb, jsonb) from public, anon;
grant execute on function public.sj_report_apply(text, jsonb, jsonb) to authenticated;

-- ══ PAKET DATA MONITOR (tanpa Aging) ═══════════════════════════════
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

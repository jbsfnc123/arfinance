-- Rollback 0044_sj_upload_perf → kembali ke definisi 0042 (commit menghitung hash/tanggal sekaligus).
-- Hanya bila staging kosong (tidak ada upload berjalan). Data sj_events/sj_batches/sj_receivers TIDAK disentuh.
do $$ begin
  if exists (select 1 from private.sj_stage) then raise exception 'private.sj_stage tidak kosong — tunggu upload selesai'; end if;
end $$;
drop table private.sj_stage;
create table private.sj_stage (
  batch_id bigint not null references public.sj_batches(id) on delete cascade,
  row_no   integer not null,
  data     jsonb not null,
  primary key (batch_id, row_no)
);
alter table private.sj_stage enable row level security;
revoke all on private.sj_stage from anon, authenticated;
create index if not exists sj_events_tanggal_idx on public.sj_events (tanggal_sj);
drop function if exists private.sj_date(text);
create or replace function private.sj_date(p text)
returns date
language plpgsql immutable set search_path = ''
as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return p::date;
exception when others then
  return null;
end;
$$;
revoke execute on function private.sj_date(text) from public, anon, authenticated;
create or replace function public.sj_upload_begin(p_file_name text, p_sha256 text, p_rows_total integer, p_rows_bad integer)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_id bigint;
begin
  if not private.sj_can_manage() then
    raise exception 'Akses ditolak: upload hanya untuk Controller/Super Admin' using errcode = '42501';
  end if;
  if coalesce(p_rows_total, 0) not between 1 and 200000 then
    raise exception 'Jumlah baris harus 1–200.000' using errcode = '22023';
  end if;
  delete from public.sj_batches where status = 'staging' and created_at < now() - interval '1 day';
  insert into public.sj_batches (file_name, sha256, rows_total, rows_bad)
  values (left(coalesce(nullif(trim(p_file_name), ''), 'tanpa-nama.csv'), 200), p_sha256, p_rows_total, greatest(coalesce(p_rows_bad, 0), 0))
  returning id into v_id;
  return jsonb_build_object('batch', v_id,
    'seenAt', (select max(published_at) from public.sj_batches where sha256 = p_sha256 and status = 'published' and p_sha256 is not null));
end;
$$;
create or replace function public.sj_upload_rows(p_batch bigint, p_offset integer, p_rows jsonb)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare b public.sj_batches; v_n integer;
begin
  if not private.sj_can_manage() then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  select * into b from public.sj_batches where id = p_batch;
  if b.id is null or b.status <> 'staging' or b.uploaded_by is distinct from (select auth.uid()) then
    raise exception 'Batch upload tidak ditemukan atau sudah selesai' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'Potongan tidak valid (maks. 5.000 baris)' using errcode = '22023';
  end if;
  if p_offset < 0 or p_offset + jsonb_array_length(p_rows) > b.rows_total then
    raise exception 'Potongan melebihi jumlah baris yang diumumkan' using errcode = '22023';
  end if;
  insert into private.sj_stage (batch_id, row_no, data)
  select p_batch, p_offset + e.ord::int, e.value from jsonb_array_elements(p_rows) with ordinality e(value, ord)
  on conflict (batch_id, row_no) do update set data = excluded.data;   -- kirim ulang potongan yang sama aman
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
create or replace function public.sj_upload_commit(p_batch bigint)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare b public.sj_batches; v_staged integer; v_bad integer; v_new integer; v_seq bigint;
begin
  if not private.sj_can_manage() then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  select * into b from public.sj_batches where id = p_batch for update;
  if b.id is null or b.status <> 'staging' or b.uploaded_by is distinct from (select auth.uid()) then
    raise exception 'Batch upload tidak ditemukan atau sudah selesai' using errcode = 'P0002';
  end if;
  select count(*) into v_staged from private.sj_stage where batch_id = p_batch;
  if v_staged <> b.rows_total then
    raise exception 'Upload belum lengkap (% dari % baris). Ulangi upload.', v_staged, b.rows_total using errcode = 'P0001';
  end if;
  select count(*) into v_bad from private.sj_stage
   where batch_id = p_batch and (coalesce(trim(data->>'sj_no'), '') = '' or length(data::text) > 20000);
  if v_bad > 0 then
    raise exception '% baris tidak valid (No. SJ kosong / terlalu panjang)', v_bad using errcode = '22023';
  end if;

  insert into public.sj_events (batch_id, row_no, event_key, sj_no, sj_key, area, tanggal_sj, tanggal_sj_raw, business_partner,
    locator, send_date, send_date_raw, sender, receive_date, receive_date_raw, receiver, jumlah_hari_raw, faktur, description,
    no_route, shipper_1, no_plat, driver, shipper_2, send_receipt_doc_no)
  select p_batch, case when d->>'line' ~ '^\d{1,9}$' then (d->>'line')::int else s.row_no end,
    encode(sha256(convert_to(concat_ws(chr(31),
      d->>'area', d->>'sj_no', d->>'tanggal_sj_raw', d->>'business_partner', d->>'locator', d->>'send_date_raw', d->>'sender_raw',
      d->>'receive_date_raw', d->>'receiver_raw', d->>'jumlah_hari_raw', d->>'faktur', d->>'description', d->>'no_route',
      d->>'shipper_1', d->>'no_plat', d->>'driver', d->>'shipper_2', d->>'send_receipt_doc_no'), 'UTF8')), 'hex'),
    trim(d->>'sj_no'), upper(trim(d->>'sj_no')), d->>'area', private.sj_date(d->>'tanggal_sj'), d->>'tanggal_sj_raw',
    d->>'business_partner', d->>'locator', private.sj_date(d->>'send_date'), d->>'send_date_raw', nullif(d->>'sender', ''),
    private.sj_date(d->>'receive_date'), d->>'receive_date_raw', nullif(d->>'receiver', ''), d->>'jumlah_hari_raw',
    d->>'faktur', d->>'description', d->>'no_route', d->>'shipper_1', d->>'no_plat', d->>'driver', d->>'shipper_2',
    d->>'send_receipt_doc_no'
  from private.sj_stage s cross join lateral (select s.data as d) x
  where s.batch_id = p_batch
  order by s.row_no
  on conflict (event_key) do nothing;
  get diagnostics v_new = row_count;

  v_seq := nextval('public.sj_publish_seq');
  update public.sj_batches set status = 'published', publish_seq = v_seq, published_at = now(),
    rows_new = v_new, rows_dup = v_staged - v_new
  where id = p_batch;
  delete from private.sj_stage where batch_id = p_batch;
  insert into public.import_log (module, kind, file_name, rows) values ('sj', 'csv', b.file_name, v_new);
  return jsonb_build_object('batch', p_batch, 'total', v_staged, 'new', v_new, 'dup', v_staged - v_new, 'bad', b.rows_bad);
end;
$$;

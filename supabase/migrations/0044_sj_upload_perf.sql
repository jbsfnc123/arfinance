-- 0044: Monitor Surat Jalan — commit upload lebih ringan (Fase 45, setelah uji beban di produksi).
-- Uji 25.513 baris: commit 0042 = 4,3 dtk (batas statement authenticated 8 dtk). Penyebab: hash event_key, parsing jsonb &
-- sj_date plpgsql ber-EXCEPTION (subtransaksi per panggilan) dihitung sekaligus saat commit. Sekarang semuanya dihitung per
-- potongan di sj_upload_rows ke staging bertipe; commit tinggal insert-select. Batas upload 60.000 baris/file.
-- Perilaku publik tidak berubah (signature RPC, aturan dedup, atomisitas, hak akses sama).
-- Rollback: supabase/rollback/0044_sj_upload_perf_down.sql.

-- Tanggal ISO → date tanpa EXCEPTION (bisa di-inline). Tanggal mustahil (mis. 2026-02-30) → null, tidak ditebak.
create or replace function private.sj_date(p text)
returns date
language sql immutable set search_path = ''
as $$
  select case when p ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$'
    and substr(p, 9, 2)::int <= extract(day from (substr(p, 1, 7) || '-01')::date + interval '1 month' - interval '1 day')
    then p::date end;
$$;
revoke execute on function private.sj_date(text) from public, anon, authenticated;

-- Staging bertipe (kosong: modul belum dipakai; dijaga agar tidak menghapus upload yang sedang berjalan).
do $$ begin
  if exists (select 1 from private.sj_stage) then raise exception 'private.sj_stage tidak kosong — tunggu upload selesai'; end if;
end $$;
drop table private.sj_stage;
create table private.sj_stage (
  batch_id            bigint not null references public.sj_batches(id) on delete cascade,
  row_no              integer not null,           -- posisi dalam batch (1..rows_total)
  line                integer not null,           -- nomor baris di file sumber
  event_key           text not null,
  sj_no               text not null check (sj_no <> ''),
  sj_key              text not null,
  area                text,
  tanggal_sj          date,
  tanggal_sj_raw      text,
  business_partner    text,
  locator             text,
  send_date           date,
  send_date_raw       text,
  sender              text,
  receive_date        date,
  receive_date_raw    text,
  receiver            text,
  jumlah_hari_raw     text,
  faktur              text,
  description         text,
  no_route            text,
  shipper_1           text,
  no_plat             text,
  driver              text,
  shipper_2           text,
  send_receipt_doc_no text,
  primary key (batch_id, row_no)
);
alter table private.sj_stage enable row level security;
revoke all on private.sj_stage from anon, authenticated;

-- Tidak dipakai kueri mana pun (pack membaca semua kejadian; detail memakai sj_key) — hanya memperlambat insert.
drop index if exists public.sj_events_tanggal_idx;

create or replace function public.sj_upload_begin(p_file_name text, p_sha256 text, p_rows_total integer, p_rows_bad integer)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_id bigint;
begin
  if not private.sj_can_manage() then
    raise exception 'Akses ditolak: upload hanya untuk Controller/Super Admin' using errcode = '42501';
  end if;
  if coalesce(p_rows_total, 0) not between 1 and 60000 then
    raise exception 'Jumlah baris harus 1–60.000 per upload (pecah file bila lebih besar)' using errcode = '22023';
  end if;
  delete from public.sj_batches where status = 'staging' and created_at < now() - interval '1 day';
  insert into public.sj_batches (file_name, sha256, rows_total, rows_bad)
  values (left(coalesce(nullif(trim(p_file_name), ''), 'tanpa-nama.csv'), 200), p_sha256, p_rows_total, greatest(coalesce(p_rows_bad, 0), 0))
  returning id into v_id;
  return jsonb_build_object('batch', v_id,
    'seenAt', (select max(published_at) from public.sj_batches where sha256 = p_sha256 and status = 'published' and p_sha256 is not null));
end;
$$;

-- Satu potongan (maks. 5.000 baris): validasi, hitung event_key & tanggal, simpan ke staging. Kirim ulang potongan sama aman.
create or replace function public.sj_upload_rows(p_batch bigint, p_offset integer, p_rows jsonb)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare b public.sj_batches; v_n integer; v_bad integer;
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
  v_n := jsonb_array_length(p_rows);
  if p_offset < 0 or p_offset + v_n > b.rows_total then
    raise exception 'Potongan melebihi jumlah baris yang diumumkan' using errcode = '22023';
  end if;
  select count(*) into v_bad from jsonb_array_elements(p_rows) e(d)
   where jsonb_typeof(d) <> 'object' or coalesce(trim(d->>'sj_no'), '') = '' or length(d::text) > 20000;
  if v_bad > 0 then
    raise exception '% baris tidak valid (No. SJ kosong / terlalu panjang)', v_bad using errcode = '22023';
  end if;

  delete from private.sj_stage where batch_id = p_batch and row_no between p_offset + 1 and p_offset + v_n;
  insert into private.sj_stage (batch_id, row_no, line, event_key, sj_no, sj_key, area, tanggal_sj, tanggal_sj_raw, business_partner,
    locator, send_date, send_date_raw, sender, receive_date, receive_date_raw, receiver, jumlah_hari_raw, faktur, description,
    no_route, shipper_1, no_plat, driver, shipper_2, send_receipt_doc_no)
  select p_batch, p_offset + e.ord::int,
    case when d->>'line' ~ '^\d{1,9}$' then (d->>'line')::int else p_offset + e.ord::int end,
    encode(sha256(convert_to(concat_ws(chr(31),
      d->>'area', d->>'sj_no', d->>'tanggal_sj_raw', d->>'business_partner', d->>'locator', d->>'send_date_raw', d->>'sender_raw',
      d->>'receive_date_raw', d->>'receiver_raw', d->>'jumlah_hari_raw', d->>'faktur', d->>'description', d->>'no_route',
      d->>'shipper_1', d->>'no_plat', d->>'driver', d->>'shipper_2', d->>'send_receipt_doc_no'), 'UTF8')), 'hex'),
    trim(d->>'sj_no'), upper(trim(d->>'sj_no')), d->>'area', private.sj_date(d->>'tanggal_sj'), d->>'tanggal_sj_raw',
    d->>'business_partner', d->>'locator', private.sj_date(d->>'send_date'), d->>'send_date_raw', nullif(d->>'sender', ''),
    private.sj_date(d->>'receive_date'), d->>'receive_date_raw', nullif(d->>'receiver', ''), d->>'jumlah_hari_raw',
    d->>'faktur', d->>'description', d->>'no_route', d->>'shipper_1', d->>'no_plat', d->>'driver', d->>'shipper_2',
    d->>'send_receipt_doc_no'
  from jsonb_array_elements(p_rows) with ordinality e(d, ord);
  return v_n;
end;
$$;

-- Publikasikan batch secara atomik: staging lengkap → insert-select (identik dilewati) → published. Belum lengkap → error.
create or replace function public.sj_upload_commit(p_batch bigint)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare b public.sj_batches; v_staged integer; v_new integer;
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

  insert into public.sj_events (batch_id, row_no, event_key, sj_no, sj_key, area, tanggal_sj, tanggal_sj_raw, business_partner,
    locator, send_date, send_date_raw, sender, receive_date, receive_date_raw, receiver, jumlah_hari_raw, faktur, description,
    no_route, shipper_1, no_plat, driver, shipper_2, send_receipt_doc_no)
  select p_batch, line, event_key, sj_no, sj_key, area, tanggal_sj, tanggal_sj_raw, business_partner,
    locator, send_date, send_date_raw, sender, receive_date, receive_date_raw, receiver, jumlah_hari_raw, faktur, description,
    no_route, shipper_1, no_plat, driver, shipper_2, send_receipt_doc_no
  from private.sj_stage where batch_id = p_batch
  on conflict (event_key) do nothing;
  get diagnostics v_new = row_count;

  update public.sj_batches set status = 'published', publish_seq = nextval('public.sj_publish_seq'), published_at = now(),
    rows_new = v_new, rows_dup = v_staged - v_new
  where id = p_batch;
  delete from private.sj_stage where batch_id = p_batch;
  insert into public.import_log (module, kind, file_name, rows) values ('sj', 'csv', b.file_name, v_new);
  return jsonb_build_object('batch', p_batch, 'total', v_staged, 'new', v_new, 'dup', v_staged - v_new, 'bad', b.rows_bad);
end;
$$;

-- 0042: Fase 45 — Monitor Surat Jalan (serah terima dokumen SJ dari "Laporan Serah Terima Surat Jalan" CSV).
-- Hanya MENAMBAH objek khusus modul: batch upload, staging, kejadian serah terima, daftar Receiver + jejak perubahan,
-- aturan akses (RLS), trigger versi, dan RPC. Tidak mengubah tabel/fungsi bersama, faktur, maupun worksheet
-- Mitra10/RKM (satu-satunya sentuhan tabel bersama: insert baris import_log saat upload berhasil).
-- Rollback: supabase/rollback/0042_monitor_sj_down.sql.
--
-- Bentuk CSV (diperiksa dari file contoh): 18 kolom, satu baris = satu kejadian kirim/terima dokumen; SJ No. bisa
-- berulang (riwayat). Aturan pengakuan Receiver & "penerimaan pertama" dihitung di browser dari seluruh kejadian
-- terpublikasi (lib/modules/sj/compute.ts) supaya dashboard, Kertas Kerja & ekspor memakai definisi yang sama.

-- ══ BATCH UPLOAD ═══════════════════════════════════════════════════
create sequence public.sj_publish_seq;
create table public.sj_batches (
  id           bigint generated always as identity primary key,
  file_name    text not null,
  sha256       text,
  status       text not null default 'staging' check (status in ('staging', 'published')),
  rows_total   integer not null check (rows_total between 1 and 200000),
  rows_new     integer,
  rows_dup     integer,
  rows_bad     integer not null default 0,
  publish_seq  bigint unique,               -- urutan antar-upload (dipakai aturan "penerimaan pertama")
  uploaded_by  uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  published_at timestamptz,
  check ((status = 'published') = (publish_seq is not null))
);
comment on table public.sj_batches is 'Monitor Surat Jalan: riwayat upload CSV. Hanya batch published yang terlihat di data.';

-- Staging per potongan (chunk). Tidak terbaca pengguna; dipindah ke sj_events hanya saat commit lengkap.
create table private.sj_stage (
  batch_id bigint not null references public.sj_batches(id) on delete cascade,
  row_no   integer not null,
  data     jsonb not null,
  primary key (batch_id, row_no)
);

-- ══ KEJADIAN SERAH TERIMA (baris sumber) ═══════════════════════════
create table public.sj_events (
  id                  bigint generated always as identity primary key,
  batch_id            bigint not null references public.sj_batches(id),
  row_no              integer not null,          -- nomor baris di file sumber (urutan asli; baris header = 1)
  event_key           text not null unique,      -- sha256 seluruh nilai mentah → upload ulang/tumpang tindih tidak menggandakan
  sj_no               text not null check (sj_no <> ''),
  sj_key              text not null,             -- upper(trim(sj_no)); identitas surat jalan
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
  receiver            text,                      -- nama asli dari sumber (bukan hasil normalisasi)
  jumlah_hari_raw     text,
  faktur              text,
  description         text,
  no_route            text,
  shipper_1           text,
  no_plat             text,
  driver              text,
  shipper_2           text,
  send_receipt_doc_no text
);
create index sj_events_sj_key_idx on public.sj_events (sj_key);
create index sj_events_tanggal_idx on public.sj_events (tanggal_sj);
create index sj_events_batch_idx on public.sj_events (batch_id, row_no);
comment on table public.sj_events is 'Monitor Surat Jalan: kejadian kirim/terima per baris CSV (riwayat, tidak pernah dihapus oleh upload).';

-- ══ DAFTAR RECEIVER YANG DIAKUI ════════════════════════════════════
create table public.sj_receivers (
  id         bigint generated always as identity primary key,
  name       text not null check (name <> ''),
  name_norm  text not null unique,              -- lower + trim + spasi tunggal (pencocokan tanpa fuzzy)
  active     boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz
);
create table public.sj_receiver_log (
  id          bigint generated always as identity primary key,
  receiver_id bigint not null references public.sj_receivers(id),
  action      text not null check (action in ('tambah', 'ubah', 'aktifkan', 'nonaktifkan')),
  old_name    text,
  new_name    text,
  by_user     uuid default auth.uid(),
  at          timestamptz not null default now()
);
insert into public.sj_receivers (name, name_norm, created_by) values
  ('Bintang Anugia Arragi', 'bintang anugia arragi', null),
  ('Wienda Aswar', 'wienda aswar', null);

-- ══ ATURAN AKSES ═══════════════════════════════════════════════════
-- Baca: akun yang dicentang menu Monitor Surat Jalan. Kelola (upload & Receiver): Controller/Super Admin + menu.
create or replace function private.sj_can_manage()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.has_menu('tukar.monitor_sj') and coalesce(private.my_kind() in ('sa', 'ctrl'), false);
$$;
revoke execute on function private.sj_can_manage() from public, anon;
grant execute on function private.sj_can_manage() to authenticated;

alter table public.sj_batches enable row level security;
alter table public.sj_events enable row level security;
alter table public.sj_receivers enable row level security;
alter table public.sj_receiver_log enable row level security;
alter table private.sj_stage enable row level security;
create policy "baca batch surat jalan" on public.sj_batches for select to authenticated using (private.has_menu('tukar.monitor_sj'));
create policy "baca kejadian surat jalan" on public.sj_events for select to authenticated using (private.has_menu('tukar.monitor_sj'));
create policy "baca receiver surat jalan" on public.sj_receivers for select to authenticated using (private.has_menu('tukar.monitor_sj'));
create policy "baca log receiver surat jalan" on public.sj_receiver_log for select to authenticated using (private.has_menu('tukar.monitor_sj'));
-- Hak minimum: hanya SELECT (tulis lewat RPC); cabut hak default Supabase termasuk TRUNCATE.
revoke all on public.sj_batches, public.sj_events, public.sj_receivers, public.sj_receiver_log from anon, authenticated;
grant select on public.sj_batches, public.sj_events, public.sj_receivers, public.sj_receiver_log to authenticated;
revoke all on private.sj_stage from anon, authenticated;
revoke all on sequence public.sj_publish_seq from anon, authenticated;

-- Token versi: upload & perubahan Receiver memicu muat ulang di browser pengguna berwenang.
create trigger bump_version_sj_events after insert or update or delete or truncate on public.sj_events
  for each statement execute function private.bump_version('sj');
create trigger bump_version_sj_batches after insert or update or delete or truncate on public.sj_batches
  for each statement execute function private.bump_version('sj');
create trigger bump_version_sj_receivers after insert or update or delete or truncate on public.sj_receivers
  for each statement execute function private.bump_version('sj');
insert into public.data_versions (key, updated_at) values ('sj', now()) on conflict (key) do nothing;

-- ══ RPC ════════════════════════════════════════════════════════════
-- Tanggal ISO (YYYY-MM-DD) dari browser → date; selain itu null (tidak ditebak).
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

-- Paket data untuk browser (batch, bukan per baris). Kolom panjang (Description, rute, armada) tidak ikut —
-- tersedia per surat jalan lewat sj_events_of.
create or replace function public.pack_sj()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_menu('tukar.monitor_sj') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'events', private.pack('select e.id, b.publish_seq as seq, e.row_no, e.batch_id, e.sj_no, e.sj_key, e.area, e.tanggal_sj,
        e.tanggal_sj_raw, e.business_partner, e.locator, e.send_date, e.sender, e.receive_date, e.receive_date_raw,
        e.receiver, e.faktur, e.send_receipt_doc_no
      from public.sj_events e join public.sj_batches b on b.id = e.batch_id and b.status = ''published''
      order by b.publish_seq, e.row_no',
      array['id', 'seq', 'row_no', 'batch_id', 'sj_no', 'sj_key', 'area', 'tanggal_sj', 'tanggal_sj_raw', 'business_partner',
            'locator', 'send_date', 'sender', 'receive_date', 'receive_date_raw', 'receiver', 'faktur', 'send_receipt_doc_no']),
    'receivers', private.pack('select id, name, active from public.sj_receivers order by id', array['id', 'name', 'active']),
    'batches', private.pack('select b.id, b.file_name, b.rows_total, b.rows_new, b.rows_dup, b.rows_bad, b.published_at,
        coalesce(p.display_name, ''-'') as uploader
      from public.sj_batches b left join public.profiles p on p.id = b.uploaded_by
      where b.status = ''published'' order by b.publish_seq desc limit 100',
      array['id', 'file_name', 'rows_total', 'rows_new', 'rows_dup', 'rows_bad', 'published_at', 'uploader']),
    'log', private.pack('select l.at, l.action, l.old_name, l.new_name, coalesce(p.display_name, ''-'') as by_name
      from public.sj_receiver_log l left join public.profiles p on p.id = l.by_user order by l.at desc limit 50',
      array['at', 'action', 'old_name', 'new_name', 'by_name']),
    'canManage', private.sj_can_manage());
end;
$$;

-- Semua baris sumber satu surat jalan (untuk detail riwayat), urut sumber.
create or replace function public.sj_events_of(p_sj_key text)
returns setof public.sj_events
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_menu('tukar.monitor_sj') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return query select e.* from public.sj_events e join public.sj_batches b on b.id = e.batch_id
    where e.sj_key = upper(trim(p_sj_key)) and b.status = 'published' order by b.publish_seq, e.row_no;
end;
$$;

-- Mulai upload: hanya pengelola; bersihkan staging kedaluwarsa; beri tahu bila file identik pernah dipublikasi.
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

-- Simpan satu potongan ke staging. Hanya pemilik batch yang masih staging; maks 5.000 baris per potongan.
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

-- Publikasikan batch secara atomik. Potongan belum lengkap → error, tidak ada data yang tampil setengah.
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

-- Tambah (p_id null) / ubah nama / aktif-nonaktif Receiver. Tidak pernah menghapus; setiap perubahan dicatat.
create or replace function public.sj_receiver_save(p_id bigint, p_name text, p_active boolean)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_name text; v_norm text; r public.sj_receivers; v_id bigint;
begin
  if not private.sj_can_manage() then
    raise exception 'Akses ditolak: pengaturan Receiver hanya untuk Controller/Super Admin' using errcode = '42501';
  end if;
  v_name := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  if v_name = '' or length(v_name) > 120 then
    raise exception 'Nama Receiver wajib diisi (maks. 120 karakter)' using errcode = '22023';
  end if;
  v_norm := lower(v_name);
  if exists (select 1 from public.sj_receivers where name_norm = v_norm and id is distinct from p_id) then
    raise exception 'Nama "%" sudah ada di daftar', v_name using errcode = '23505';
  end if;
  if p_id is null then
    insert into public.sj_receivers (name, name_norm, active) values (v_name, v_norm, coalesce(p_active, true)) returning id into v_id;
    insert into public.sj_receiver_log (receiver_id, action, new_name) values (v_id, 'tambah', v_name);
  else
    select * into r from public.sj_receivers where id = p_id for update;
    if r.id is null then raise exception 'Receiver tidak ditemukan' using errcode = 'P0002'; end if;
    update public.sj_receivers set name = v_name, name_norm = v_norm, active = coalesce(p_active, r.active),
      updated_by = auth.uid(), updated_at = now() where id = p_id;
    v_id := p_id;
    if r.name <> v_name then
      insert into public.sj_receiver_log (receiver_id, action, old_name, new_name) values (p_id, 'ubah', r.name, v_name);
    end if;
    if r.active <> coalesce(p_active, r.active) then
      insert into public.sj_receiver_log (receiver_id, action, old_name, new_name)
      values (p_id, case when p_active then 'aktifkan' else 'nonaktifkan' end, v_name, v_name);
    end if;
  end if;
  return jsonb_build_object('id', v_id, 'name', v_name);
end;
$$;

revoke execute on function public.pack_sj() from public, anon;
revoke execute on function public.sj_events_of(text) from public, anon;
revoke execute on function public.sj_upload_begin(text, text, integer, integer) from public, anon;
revoke execute on function public.sj_upload_rows(bigint, integer, jsonb) from public, anon;
revoke execute on function public.sj_upload_commit(bigint) from public, anon;
revoke execute on function public.sj_receiver_save(bigint, text, boolean) from public, anon;
grant execute on function public.pack_sj() to authenticated;
grant execute on function public.sj_events_of(text) to authenticated;
grant execute on function public.sj_upload_begin(text, text, integer, integer) to authenticated;
grant execute on function public.sj_upload_rows(bigint, integer, jsonb) to authenticated;
grant execute on function public.sj_upload_commit(bigint) to authenticated;
grant execute on function public.sj_receiver_save(bigint, text, boolean) to authenticated;

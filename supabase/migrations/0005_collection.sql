-- 0005: Fase 1 — AR Collection.
-- Pengganti sheet Update_Tagihan, Tagihan (target), Catatan, Janji Bayar, Kontak,
-- dan sumber tukar faktur (Tukar Faktur/Ekspedisi/Sistem/WA/Email) di Aplikasi Utama.
-- Aturan dipertahankan dari Code.gs: lunas = sisa <= 1000; aging dari due date
-- (Asia/Jakarta); tukar faktur prioritas Kolektor > Ekspedisi > Sistem > WA > Email.

-- ── Helper akses data ─────────────────────────────────────────────
create or replace function private.is_ctrl()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.my_kind() in ('sa', 'ctrl'), false);
$$;

-- Controller & Super Admin melihat semua collection; role Collection hanya miliknya.
create or replace function private.can_see_collection(p_coll text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case private.my_kind()
    when 'sa'   then true
    when 'ctrl' then true
    when 'coll' then p_coll is not null and p_coll = private.my_collection()
    else false
  end;
$$;

revoke execute on function private.is_ctrl() from public, anon;
revoke execute on function private.can_see_collection(text) from public, anon;
grant execute on function private.is_ctrl() to authenticated;
grant execute on function private.can_see_collection(text) to authenticated;

-- ── Tagihan (pengganti Update_Tagihan; diganti penuh setiap upload) ──
create table public.ar_invoices (
  invoice_no       text primary key,
  payment_group    text,
  marketing        text,
  collection_name  text,
  business_partner text,
  bp_value         text,
  invoice_date     date,
  due_date         date,
  open_amt         numeric(18,2) not null default 0,
  no_po            text,
  no_sj            text,
  uploaded_at      timestamptz not null default now()
);
create index ar_invoices_collection_idx on public.ar_invoices (collection_name);

-- Upload bertahap: file Blank_A4 bisa belasan ribu baris, dikirim per potongan.
create table private.ar_upload_batches (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  file_name  text,
  created_at timestamptz not null default now()
);
create table private.ar_invoices_staging (
  batch_id         uuid not null references private.ar_upload_batches(id) on delete cascade,
  invoice_no       text not null,
  payment_group    text,
  marketing        text,
  collection_name  text,
  business_partner text,
  bp_value         text,
  invoice_date     date,
  due_date         date,
  open_amt         numeric(18,2) not null default 0,
  no_po            text,
  no_sj            text
);
create index ar_invoices_staging_batch_idx on private.ar_invoices_staging (batch_id);
revoke all on private.ar_upload_batches, private.ar_invoices_staging from public, anon, authenticated;

-- ── Target bulanan (pengganti sheet Tagihan) ─────────────────────
create table public.ar_targets (
  month            char(7) not null check (month ~ '^\d{4}-\d{2}$'),
  invoice_no       text not null,
  target           numeric(18,2) not null,
  marketing        text,
  collection_name  text,
  business_partner text,
  due_date         date,
  branch           text,
  primary key (month, invoice_no)
);

-- ── Catatan, janji bayar, kontak, tukar faktur ───────────────────
create table public.notes (
  id               bigint generated always as identity primary key,
  invoice_no       text not null,
  kategori         text not null check (kategori in ('Reminder', 'No Respon', 'Case', 'Administratif')),
  business_partner text,
  isi              text not null default '',
  collection_name  text,
  invoice_date     date,
  no_po            text,
  no_sj            text,
  done             boolean not null default false,
  closed_by        text,
  closed_at        timestamptz,
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid()
);
create index notes_invoice_idx on public.notes (invoice_no, id desc);
create index notes_kategori_idx on public.notes (kategori);
create index notes_collection_idx on public.notes (collection_name);

create table public.payment_promises (
  id               bigint generated always as identity primary key,
  invoice_no       text not null,
  business_partner text,
  collection_name  text,
  promise_date     date not null,
  isi              text,
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid()
);
create index payment_promises_invoice_idx on public.payment_promises (invoice_no, id desc);
create index payment_promises_collection_idx on public.payment_promises (collection_name);

create table public.contacts (
  business_partner text primary key,
  nama             text,
  no_wa            text not null,
  updated_at       timestamptz not null default now(),
  updated_by       uuid default auth.uid()
);

create table public.invoice_exchanges (
  id              bigint generated always as identity primary key,
  invoice_no      text not null,
  metode          text not null check (metode in ('Kolektor', 'Ekspedisi', 'Sistem', 'WA', 'Email')),
  tanggal         date not null,
  keterangan      text,
  resi            text,
  foto_path       text,
  kurir           text,
  collection_name text,
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid()
);
create index invoice_exchanges_invoice_idx on public.invoice_exchanges (invoice_no, id);
create index invoice_exchanges_collection_idx on public.invoice_exchanges (collection_name);

-- Versi data untuk badge "data baru" di klien (via Realtime).
create table public.data_versions (
  key        text primary key,
  updated_at timestamptz not null default now()
);
insert into public.data_versions (key) values ('ar_invoices'), ('ar_targets');

insert into public.app_settings (key, value) values
  ('mitra10_dashboard', jsonb_build_object(
     'collection', 'Yovita Ulfa',
     'payment_group_prefix', 'catur mitra sejati sentosa'))
on conflict (key) do nothing;

-- ── Views ────────────────────────────────────────────────────────
-- Baris tabel Collection: invoice terbuka (> 1000) + catatan terbaru, janji bayar
-- terbaru, dan tukar faktur sesuai prioritas sumber (record paling awal per sumber).
create view public.v_collection_rows
with (security_invoker = true) as
select
  a.invoice_no,
  a.payment_group,
  a.marketing,
  a.collection_name,
  a.business_partner,
  a.bp_value,
  a.invoice_date,
  a.due_date,
  a.open_amt,
  a.no_po,
  a.no_sj,
  n.catatan,
  p.promise_date as janji_bayar,
  x.metode       as metode_tukar,
  x.tanggal      as tanggal_tukar,
  coalesce(x.keterangan, x.resi) as keterangan,
  x.resi,
  x.foto_path
from public.ar_invoices a
left join lateral (
  select '[' || kategori || ']' || coalesce(' - ' || nullif(isi, ''), '') as catatan
  from public.notes where invoice_no = a.invoice_no
  order by id desc limit 1
) n on true
left join lateral (
  select promise_date from public.payment_promises
  where invoice_no = a.invoice_no
  order by id desc limit 1
) p on true
left join lateral (
  select metode, tanggal, keterangan, resi, foto_path
  from public.invoice_exchanges where invoice_no = a.invoice_no
  order by array_position(array['Kolektor','Ekspedisi','Sistem','WA','Email'], metode), id
  limit 1
) x on true
where a.open_amt > 1000;

-- Catatan terbaru per invoice (log Case / Administratif).
create view public.v_note_latest
with (security_invoker = true) as
select distinct on (n.invoice_no)
  n.id, n.invoice_no, n.kategori, n.business_partner, n.isi, n.collection_name,
  n.invoice_date, n.no_po, n.no_sj, n.done, n.closed_by, n.closed_at, n.created_at,
  coalesce(a.open_amt, 0) as nominal
from public.notes n
left join public.ar_invoices a on a.invoice_no = n.invoice_no
order by n.invoice_no, n.id desc;

-- ── RLS ──────────────────────────────────────────────────────────
alter table public.ar_invoices       enable row level security;
alter table public.ar_targets        enable row level security;
alter table public.notes             enable row level security;
alter table public.payment_promises  enable row level security;
alter table public.contacts          enable row level security;
alter table public.invoice_exchanges enable row level security;
alter table public.data_versions     enable row level security;

create policy "baca tagihan sesuai collection" on public.ar_invoices
  for select to authenticated using (private.can_see_collection(collection_name));

create policy "controller baca target" on public.ar_targets
  for select to authenticated using (private.is_ctrl());

create policy "baca catatan sesuai collection" on public.notes
  for select to authenticated using (private.can_see_collection(collection_name));
create policy "tambah catatan untuk invoice sendiri" on public.notes
  for insert to authenticated with check (
    private.can_see_collection(collection_name)
    and exists (select 1 from public.ar_invoices a
                where a.invoice_no = notes.invoice_no and a.collection_name = notes.collection_name));
create policy "controller ubah catatan" on public.notes
  for update to authenticated using (private.is_ctrl()) with check (private.is_ctrl());
create policy "controller hapus catatan" on public.notes
  for delete to authenticated using (private.is_ctrl());

create policy "baca janji bayar sesuai collection" on public.payment_promises
  for select to authenticated using (private.can_see_collection(collection_name));
create policy "tambah janji bayar untuk invoice sendiri" on public.payment_promises
  for insert to authenticated with check (
    private.can_see_collection(collection_name)
    and exists (select 1 from public.ar_invoices a
                where a.invoice_no = payment_promises.invoice_no
                  and a.collection_name = payment_promises.collection_name));

create policy "baca kontak" on public.contacts
  for select to authenticated using ((select auth.uid()) is not null);
create policy "tambah kontak" on public.contacts
  for insert to authenticated with check ((select auth.uid()) is not null);
create policy "ubah kontak" on public.contacts
  for update to authenticated using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

create policy "baca tukar faktur" on public.invoice_exchanges
  for select to authenticated using (
    private.is_ctrl() or private.can_see_collection(collection_name));
create policy "catat tukar via WA/Email" on public.invoice_exchanges
  for insert to authenticated with check (
    metode in ('WA', 'Email')
    and private.can_see_collection(collection_name)
    and exists (select 1 from public.ar_invoices a
                where a.invoice_no = invoice_exchanges.invoice_no
                  and a.collection_name = invoice_exchanges.collection_name));

create policy "baca versi data" on public.data_versions
  for select to authenticated using ((select auth.uid()) is not null);

-- Template WA boleh diubah Super Admin atau pemilik menu Template WA.
drop policy "sa ubah pengaturan" on public.app_settings;
create policy "ubah pengaturan" on public.app_settings
  for update to authenticated
  using (private.is_sa() or (key = 'wa_template' and private.has_menu('set.watpl')))
  with check (private.is_sa() or (key = 'wa_template' and private.has_menu('set.watpl')));

-- ── RPC: upload tagihan bertahap ─────────────────────────────────
create or replace function public.ar_upload_start(p_file_name text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not (private.is_ctrl() and private.has_menu('set.update')) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  -- Bersihkan upload lama yang tidak selesai.
  delete from private.ar_upload_batches where created_at < now() - interval '1 day';
  insert into private.ar_upload_batches (user_id, file_name)
  values ((select auth.uid()), p_file_name) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.ar_upload_chunk(p_batch uuid, p_rows jsonb)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not exists (select 1 from private.ar_upload_batches
                 where id = p_batch and user_id = (select auth.uid())) then
    raise exception 'Batch upload tidak ditemukan' using errcode = 'P0002';
  end if;
  insert into private.ar_invoices_staging
    (batch_id, invoice_no, payment_group, marketing, collection_name, business_partner,
     bp_value, invoice_date, due_date, open_amt, no_po, no_sj)
  select p_batch, r.invoice_no, r.payment_group, r.marketing, r.collection_name,
         r.business_partner, r.bp_value, r.invoice_date, r.due_date,
         coalesce(r.open_amt, 0), r.no_po, r.no_sj
  from jsonb_to_recordset(p_rows) as r(
    invoice_no text, payment_group text, marketing text, collection_name text,
    business_partner text, bp_value text, invoice_date date, due_date date,
    open_amt numeric, no_po text, no_sj text)
  where nullif(trim(r.invoice_no), '') is not null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.ar_upload_finish(p_batch uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_file  text;
  v_count integer;
begin
  select file_name into v_file from private.ar_upload_batches
  where id = p_batch and user_id = (select auth.uid());
  if not found then
    raise exception 'Batch upload tidak ditemukan' using errcode = 'P0002';
  end if;
  if not exists (select 1 from private.ar_invoices_staging where batch_id = p_batch) then
    raise exception 'Tidak ada baris untuk disimpan' using errcode = '22023';
  end if;

  -- Ganti penuh, seperti clear + write sheet Update_Tagihan.
  delete from public.ar_invoices where true;
  insert into public.ar_invoices
    (invoice_no, payment_group, marketing, collection_name, business_partner,
     bp_value, invoice_date, due_date, open_amt, no_po, no_sj)
  select distinct on (invoice_no)
    invoice_no, payment_group, marketing, collection_name, business_partner,
    bp_value, invoice_date, due_date, open_amt, no_po, no_sj
  from private.ar_invoices_staging where batch_id = p_batch
  order by invoice_no;
  get diagnostics v_count = row_count;

  delete from private.ar_upload_batches where id = p_batch;

  update public.data_versions set updated_at = now() where key = 'ar_invoices';
  insert into public.app_settings (key, value, updated_by)
  values ('last_tagihan_update', to_jsonb(now()), (select auth.uid()))
  on conflict (key) do update set value = excluded.value, updated_at = now(),
    updated_by = excluded.updated_by;
  insert into public.import_log (module, kind, file_name, rows, user_id)
  values ('collection', 'update_tagihan', v_file, v_count, (select auth.uid()));

  return jsonb_build_object('rows', v_count);
end;
$$;

-- ── RPC: target bulanan ──────────────────────────────────────────
-- Kolom opsional yang kosong di file diisi dari ar_invoices.
create or replace function public.ar_target_replace(p_month text, p_rows jsonb, p_file_name text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not (private.is_ctrl() and private.has_menu('set.target')) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if p_month !~ '^\d{4}-\d{2}$' then
    raise exception 'Format bulan harus YYYY-MM' using errcode = '22023';
  end if;

  delete from public.ar_targets where month = p_month;
  insert into public.ar_targets
    (month, invoice_no, target, marketing, collection_name, business_partner, due_date, branch)
  select distinct on (r.invoice_no)
    p_month, r.invoice_no, r.target,
    coalesce(nullif(trim(r.marketing), ''), a.marketing),
    coalesce(nullif(trim(r.collection_name), ''), a.collection_name),
    coalesce(nullif(trim(r.business_partner), ''), a.business_partner),
    coalesce(r.due_date, a.due_date),
    nullif(trim(r.branch), '')
  from jsonb_to_recordset(p_rows) as r(
    invoice_no text, target numeric, marketing text, collection_name text,
    business_partner text, due_date date, branch text)
  left join public.ar_invoices a on a.invoice_no = r.invoice_no
  where nullif(trim(r.invoice_no), '') is not null and r.target is not null
  order by r.invoice_no;
  get diagnostics v_count = row_count;

  update public.data_versions set updated_at = now() where key = 'ar_targets';
  insert into public.import_log (module, kind, file_name, months, rows, user_id)
  values ('collection', 'target', p_file_name, array[p_month], v_count, (select auth.uid()));
  return v_count;
end;
$$;

revoke execute on function public.ar_upload_start(text) from public, anon;
revoke execute on function public.ar_upload_chunk(uuid, jsonb) from public, anon;
revoke execute on function public.ar_upload_finish(uuid) from public, anon;
revoke execute on function public.ar_target_replace(text, jsonb, text) from public, anon;
grant execute on function public.ar_upload_start(text) to authenticated;
grant execute on function public.ar_upload_chunk(uuid, jsonb) to authenticated;
grant execute on function public.ar_upload_finish(uuid) to authenticated;
grant execute on function public.ar_target_replace(text, jsonb, text) to authenticated;

-- ── RPC: aksi grup catatan (kunci Kategori + BP + isi) ───────────
-- security invoker: RLS "controller ubah/hapus catatan" yang menegakkan hak akses.
create or replace function public.note_group_update(
  p_cat text, p_bp text, p_isi text, p_new_cat text, p_new_isi text)
returns integer
language plpgsql volatile security invoker set search_path = ''
as $$
declare v_count integer;
begin
  update public.notes set kategori = p_new_cat, isi = coalesce(p_new_isi, '')
  where kategori = p_cat
    and coalesce(nullif(trim(business_partner), ''), 'Tanpa Partner')
        = coalesce(nullif(trim(p_bp), ''), 'Tanpa Partner')
    and trim(isi) = trim(coalesce(p_isi, ''));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.note_group_delete(p_cat text, p_bp text, p_isi text)
returns integer
language plpgsql volatile security invoker set search_path = ''
as $$
declare v_count integer;
begin
  delete from public.notes
  where kategori = p_cat
    and coalesce(nullif(trim(business_partner), ''), 'Tanpa Partner')
        = coalesce(nullif(trim(p_bp), ''), 'Tanpa Partner')
    and trim(isi) = trim(coalesce(p_isi, ''));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.note_group_done(p_cat text, p_bp text, p_isi text, p_done boolean)
returns integer
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_count integer;
  v_name  text := (select display_name from public.profiles where id = (select auth.uid()));
begin
  update public.notes
  set done = p_done,
      closed_by = case when p_done then v_name end,
      closed_at = case when p_done then now() end
  where kategori = p_cat
    and coalesce(nullif(trim(business_partner), ''), 'Tanpa Partner')
        = coalesce(nullif(trim(p_bp), ''), 'Tanpa Partner')
    and trim(isi) = trim(coalesce(p_isi, ''));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ── RPC: ringkasan Dashboard Controller (port getSpvSummary) ─────
create or replace function public.get_spv_summary(p_month text)
returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare v jsonb;
begin
  if not private.is_ctrl() then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;

  with today as (
    select (now() at time zone 'Asia/Jakarta')::date as d
  ),
  base as (
    select
      t.invoice_no,
      coalesce(nullif(trim(t.marketing), ''), 'Tanpa Marketing')        as mkt,
      coalesce(nullif(trim(t.collection_name), ''), 'Tanpa Collection') as coll,
      coalesce(nullif(trim(t.business_partner), ''), 'Tanpa Partner')   as bp,
      coalesce(nullif(trim(t.branch), ''), 'Tanpa Branch')              as branch,
      t.target,
      coalesce(a.open_amt, 0)          as sisa,
      coalesce(t.due_date, a.due_date) as due,
      pp.promise_date                  as jb
    from public.ar_targets t
    left join public.ar_invoices a on a.invoice_no = t.invoice_no
    left join lateral (
      select promise_date from public.payment_promises p
      where p.invoice_no = t.invoice_no order by p.id desc limit 1
    ) pp on true
    where t.month = p_month
  ),
  r as (
    select b.*,
      b.sisa <= 1000                          as lunas,
      (select d from today) - b.due           as days,
      (b.sisa > 1000 and b.jb is not null)    as open_janji
    from base b
  ),
  r2 as (
    select r.*,
      case when due is null then '-'
           when days <= 0  then 'Belum Jatuh Tempo'
           when days <= 30 then '1-30 Hari'
           when days <= 60 then '31-60 Hari'
           else '>60 Hari' end as aging
    from r
  ),
  grp as (
    select dim, nama,
      sum(target) as target, sum(sisa) as sisa,
      count(*) as inv_total,
      count(*) filter (where lunas) as inv_lunas,
      count(*) filter (where not lunas) as inv_belum,
      coalesce(sum(sisa) filter (where open_janji), 0) as janji_nom,
      count(*) filter (where open_janji) as janji_count
    from (
      select 'market' as dim, mkt as nama, * from r2
      union all select 'branch', branch, * from r2
      union all select 'coll', coll, * from r2
    ) x
    group by dim, nama
  ),
  grp_json as (
    select dim, jsonb_agg(jsonb_build_object(
      'nama', nama, 'target', target, 'sisa', sisa,
      'terkumpul', greatest(0, target - sisa),
      'pencapaian', case when target > 0
                         then round(greatest(0, target - sisa) / target * 100, 1) else 0 end,
      'invTotal', inv_total, 'invLunas', inv_lunas, 'invBelum', inv_belum,
      'janjiNom', janji_nom, 'janjiCount', janji_count
    ) order by sisa desc, nama) as rows
    from grp group by dim
  ),
  g as (
    select
      coalesce(sum(target), 0) as target,
      coalesce(sum(sisa), 0)   as sisa,
      count(*)                 as inv_total,
      count(*) filter (where lunas)     as inv_lunas,
      count(*) filter (where not lunas) as inv_belum,
      coalesce(sum(sisa) filter (where open_janji), 0) as janji_nom,
      count(*) filter (where open_janji)               as janji_count,
      coalesce(sum(sisa) filter (where not lunas), 0)  as total_nominal
    from r2
  ),
  ag as (
    select jsonb_object_agg(k.aging, jsonb_build_object(
      'count', coalesce(c.cnt, 0), 'nominal', coalesce(c.nom, 0))) as data
    from (values ('Belum Jatuh Tempo'), ('1-30 Hari'), ('31-60 Hari'), ('>60 Hari')) k(aging)
    left join (
      select aging, count(*) cnt, sum(sisa) nom from r2
      where not lunas and aging <> '-' group by aging
    ) c on c.aging = k.aging
  ),
  case_inv as (
    select distinct invoice_no from public.notes where kategori = 'Case'
  ),
  case_data as (
    select jsonb_build_object(
      'count', (select count(*) from case_inv),
      'nom', coalesce((select sum(r2.sisa) from r2 join case_inv using (invoice_no)), 0)
    ) as data
  ),
  overdue as (
    select bp,
      count(*) as cnt,
      max(days) as max_days,
      sum(sisa) as total,
      (array_agg(mkt order by invoice_no))[1] as marketing
    from r2 where not lunas group by bp
  ),
  overdue_ranked as (
    select o.*,
      row_number() over (order by max_days desc nulls last, bp) as rn_all,
      row_number() over (partition by marketing order by max_days desc nulls last, bp) as rn_mkt
    from overdue o
  ),
  fc as (
    select jb, mkt, sum(sisa) as nom, count(*) as cnt,
      (select jsonb_agg(jsonb_build_object('bp', bp, 'nom', nom, 'count', cnt) order by nom desc, bp)
       from (select bp, sum(sisa) nom, count(*) cnt from r2 r3
             where r3.open_janji and r3.jb = r2.jb and r3.mkt = r2.mkt group by bp) z) as bps
    from r2 where open_janji group by jb, mkt
  )
  select jsonb_build_object(
    'month', p_month,
    'target', g.target,
    'sisa', g.sisa,
    'terkumpul', greatest(0, g.target - g.sisa),
    'pencapaian', case when g.target > 0
                       then round(greatest(0, g.target - g.sisa) / g.target * 100, 1) else 0 end,
    'forecast', g.janji_nom,
    'forecastCount', g.janji_count,
    'invTotal', g.inv_total,
    'invLunas', g.inv_lunas,
    'invBelum', g.inv_belum,
    'totalNominal', g.total_nominal,
    'totalInv', g.inv_belum,
    'agData', (select data from ag),
    'caseData', (select data from case_data),
    'byMarket', coalesce((select rows from grp_json where dim = 'market'), '[]'::jsonb),
    'byBranch', coalesce((select rows from grp_json where dim = 'branch'), '[]'::jsonb),
    'byColl',   coalesce((select rows from grp_json where dim = 'coll'), '[]'::jsonb),
    'topOverdue', coalesce((
      select jsonb_agg(jsonb_build_object('bp', bp, 'count', cnt, 'maxDays', max_days,
                                          'total', total, 'marketing', marketing) order by rn_all)
      from overdue_ranked where rn_all <= 10), '[]'::jsonb),
    'topOverdueByMarket', coalesce((
      select jsonb_object_agg(marketing, rows) from (
        select marketing, jsonb_agg(jsonb_build_object('bp', bp, 'count', cnt, 'maxDays', max_days,
                                                       'total', total, 'marketing', marketing)
                                    order by rn_mkt) as rows
        from overdue_ranked where rn_mkt <= 10 group by marketing) m), '{}'::jsonb),
    'forecastByDate', coalesce((
      select jsonb_agg(jsonb_build_object('date', jb, 'market', mkt, 'nom', nom,
                                          'count', cnt, 'bps', bps) order by jb, mkt)
      from fc), '[]'::jsonb),
    'marketingList', coalesce((select jsonb_agg(distinct mkt order by mkt) from r2), '[]'::jsonb),
    'lastTagihanUpdate', (select value from public.app_settings where key = 'last_tagihan_update')
  ) into v
  from g;

  return v;
end;
$$;

revoke execute on function public.note_group_update(text, text, text, text, text) from public, anon;
revoke execute on function public.note_group_delete(text, text, text) from public, anon;
revoke execute on function public.note_group_done(text, text, text, boolean) from public, anon;
revoke execute on function public.get_spv_summary(text) from public, anon;
grant execute on function public.note_group_update(text, text, text, text, text) to authenticated;
grant execute on function public.note_group_delete(text, text, text) to authenticated;
grant execute on function public.note_group_done(text, text, text, boolean) to authenticated;
grant execute on function public.get_spv_summary(text) to authenticated;

-- ── Realtime ─────────────────────────────────────────────────────
alter publication supabase_realtime
  add table public.notes, public.payment_promises, public.invoice_exchanges, public.data_versions;

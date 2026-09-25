-- 0014: Fase 7 — satu database terhubung tanpa duplikasi.
-- Tiga laporan ERP (Aging/Blank_A4, Invoice & Payment Date Comparison, Master BP) di-upload
-- SEKALI lewat Pusat Upload dan disimpan satu kali; semua menu membaca lewat view/RPC.
-- Website belum operasional: tabel lama di-drop tanpa migrasi data (keputusan user 2026-09-25).

-- ══ UPLOAD BERTAHAP (generik) ════════════════════════════════════
alter table public.import_log add column file_sha256 text;
create index import_log_sha_idx on public.import_log (file_sha256);

create table private.upload_batches (
  id         uuid primary key,
  kind       text not null check (kind in ('aging', 'erp', 'bpmaster')),
  user_id    uuid not null,
  file_name  text,
  sha256     text,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table private.upload_rows (
  batch uuid not null references private.upload_batches(id) on delete cascade,
  seq   integer not null,
  data  jsonb not null,
  primary key (batch, seq)
);

-- Hak upload per jenis laporan (menu mana saja yang boleh mengisi data bersama).
create or replace function private.can_upload(p_kind text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case p_kind
    when 'aging'    then private.has_menu('set.update') or private.has_menu('rek.mitra10') or private.has_menu('lap.presentasi')
    when 'erp'      then private.has_menu('rek.mutasi') or private.has_menu('lap.presentasi') or private.has_menu('rek.marketplace')
    when 'bpmaster' then private.has_menu('set.update') or private.has_menu('lap.presentasi')
    else false end;
$$;
grant execute on function private.can_upload(text) to authenticated;

-- Mulai batch. Mengembalikan waktu upload sebelumnya bila file identik (sha256) pernah di-upload.
create or replace function public.upload_begin(p_kind text, p_file_name text, p_sha256 text, p_meta jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_id uuid := gen_random_uuid();
begin
  if not private.can_upload(p_kind) then
    raise exception 'Akses ditolak untuk upload jenis %', p_kind using errcode = '42501';
  end if;
  delete from private.upload_batches where created_at < now() - interval '1 day';
  insert into private.upload_batches (id, kind, user_id, file_name, sha256, meta)
  values (v_id, p_kind, (select auth.uid()), p_file_name, p_sha256, coalesce(p_meta, '{}'::jsonb));
  return jsonb_build_object('batch', v_id,
    'seenAt', (select max(at) from public.import_log where file_sha256 = p_sha256 and p_sha256 is not null));
end;
$$;

create or replace function public.upload_rows(p_batch uuid, p_offset integer, p_rows jsonb)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not exists (select 1 from private.upload_batches where id = p_batch and user_id = (select auth.uid())) then
    raise exception 'Batch upload tidak ditemukan' using errcode = 'P0002';
  end if;
  insert into private.upload_rows (batch, seq, data)
  select p_batch, p_offset + (e.ord)::int, e.value
  from jsonb_array_elements(p_rows) with ordinality as e(value, ord);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Ambil batch milik pemanggil (dipakai fungsi commit).
create or replace function private.take_batch(p_batch uuid, p_kind text)
returns private.upload_batches
language plpgsql volatile security definer set search_path = ''
as $$
declare b private.upload_batches;
begin
  select * into b from private.upload_batches where id = p_batch and user_id = (select auth.uid()) and kind = p_kind;
  if not found then
    raise exception 'Batch upload tidak ditemukan' using errcode = 'P0002';
  end if;
  if not private.can_upload(p_kind) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return b;
end;
$$;

-- ══ PRESENTASI: agregat turunan per bulan (bukan salinan data mentah) ══
-- Dihitung ulang oleh parser Presentasi dari tabel inti saat bulan tsb ditandai "dirty".
create table public.deck_derived (
  kind       text not null check (kind in ('invoice', 'payment', 'aging', 'bpmaster')),
  month      text not null,
  series     jsonb not null default '{}'::jsonb,
  bp         jsonb not null default '[]'::jsonb,
  stats      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (kind, month)
);
create table public.deck_dirty (
  kind  text not null,
  month text not null,
  at    timestamptz not null default now(),
  primary key (kind, month)
);
alter table public.deck_derived enable row level security;
alter table public.deck_dirty   enable row level security;
create policy "deck turunan" on public.deck_derived for all to authenticated
  using (private.has_menu('lap.presentasi')) with check (private.has_menu('lap.presentasi'));
create policy "deck dirty" on public.deck_dirty for all to authenticated
  using (private.has_menu('lap.presentasi')) with check (private.has_menu('lap.presentasi'));

-- ══ MASTER BUSINESS PARTNER ══════════════════════════════════════
create table public.business_partners (
  search_key      text primary key,
  bp_key          text not null,       -- nomor tanpa akhiran ('1000258-PKP' → '1000258')
  name            text,
  payment_group   text,
  pic_ar          text,
  sales_agent     text,
  payment_term    text,
  marketing_group text,
  customer_type   text,
  credit_limit    numeric(18,2),
  credit_status   text,
  sales_region    text,
  branch          text,
  description     text,
  first_sale      date,
  last_sale       date,
  customer        text,
  updated_at      timestamptz not null default now()
);
create index business_partners_key_idx on public.business_partners (bp_key);
alter table public.business_partners enable row level security;
create policy "baca master bp" on public.business_partners for select to authenticated using (true);

create or replace function public.bp_commit(p_batch uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare b private.upload_batches; v_count integer;
begin
  b := private.take_batch(p_batch, 'bpmaster');
  -- Master = daftar lengkap: ganti penuh.
  delete from public.business_partners where true;
  insert into public.business_partners (search_key, bp_key, name, payment_group, pic_ar, sales_agent, payment_term,
    marketing_group, customer_type, credit_limit, credit_status, sales_region, branch, description, first_sale, last_sale, customer)
  select distinct on (r.search_key) r.search_key, split_part(split_part(split_part(r.search_key, '-', 1), ' ', 1), '(', 1),
    r.name, r.payment_group, r.pic_ar, r.sales_agent, r.payment_term, r.marketing_group, r.customer_type, r.credit_limit,
    r.credit_status, r.sales_region, r.branch, r.description, r.first_sale, r.last_sale, r.customer
  from private.upload_rows u
  cross join lateral jsonb_to_record(u.data) as r(search_key text, name text, payment_group text, pic_ar text,
    sales_agent text, payment_term text, marketing_group text, customer_type text, credit_limit numeric,
    credit_status text, sales_region text, branch text, description text, first_sale date, last_sale date, customer text)
  where u.batch = p_batch and nullif(trim(r.search_key), '') is not null
  order by r.search_key, u.seq desc;
  get diagnostics v_count = row_count;
  delete from private.upload_batches where id = p_batch;

  insert into public.deck_dirty (kind, month) values ('bpmaster', '-') on conflict (kind, month) do update set at = now();
  insert into public.import_log (module, kind, file_name, rows, user_id, file_sha256)
  values ('data', 'bpmaster', b.file_name, v_count, (select auth.uid()), b.sha256);
  return jsonb_build_object('rows', v_count);
end;
$$;

-- ══ AGING (Blank_A4 = MASTER AGING) ══════════════════════════════
create table public.ar_aging_snapshots (
  id         bigint generated always as identity primary key,
  month      char(7) not null unique,       -- bulan dari Invoice Date terakhir di file (sama dengan Presentasi)
  as_of      date not null,
  file_name  text,
  row_count  integer not null default 0,
  total_open numeric(20,2) not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid()
);
create index ar_aging_snapshots_created_by_idx on public.ar_aging_snapshots (created_by);

-- Semua baris file apa adanya (termasuk invoice ganda / tanpa nomor), supaya agregat
-- Presentasi identik dengan import file langsung.
create table public.ar_aging_lines (
  snapshot_id      bigint not null references public.ar_aging_snapshots(id) on delete cascade,
  line_no          integer not null,
  payment_group    text,
  limit_group      text,
  marketing        text,
  collection_name  text,
  sales_name       text,
  bp_key           text,              -- kolom "Value"
  business_partner text,
  tax_name         text,
  invoice_no       text,
  invoice_date     date,
  due_date         date,
  open_amt         numeric(18,2) not null default 0,
  cur_0_30         numeric(18,2) not null default 0,
  cur_31_60        numeric(18,2) not null default 0,
  due_1_7          numeric(18,2) not null default 0,
  due_8_30         numeric(18,2) not null default 0,
  due_31_60        numeric(18,2) not null default 0,
  due_61_90        numeric(18,2) not null default 0,
  due_90           numeric(18,2) not null default 0,
  days             integer,
  branch           text,
  follow_up        text,
  no_po            text,
  no_sj            text,
  area             text,
  primary key (snapshot_id, line_no)
);
create index ar_aging_lines_invoice_idx on public.ar_aging_lines (snapshot_id, invoice_no);
create index ar_aging_lines_coll_idx on public.ar_aging_lines (snapshot_id, collection_name);
create index ar_aging_lines_tax_idx on public.ar_aging_lines (snapshot_id, lower(trim(tax_name)));
create index ar_aging_lines_sj_idx on public.ar_aging_lines (no_sj);

alter table public.ar_aging_snapshots enable row level security;
alter table public.ar_aging_lines     enable row level security;
create policy "baca snapshot aging" on public.ar_aging_snapshots for select to authenticated using (true);
create policy "baca baris aging" on public.ar_aging_lines for select to authenticated
  using (private.can_see_collection(collection_name) or private.has_menu('rek.mitra10')
         or private.has_menu('lap.presentasi') or private.has_menu('dash.mitra10'));

insert into public.app_settings (key, value) values
  ('collection_filter', jsonb_build_object(
     'marketing', jsonb_build_array('01-Traditional', '02-Modern Market', '03-Reseller', '16-Modern Market National', '04-Proyek'),
     'after', '2026-01-01'))
on conflict (key) do nothing;

-- ── Drop struktur lama yang menyalin data aging ─────────────────
drop function if exists public.ar_upload_start(text);
drop function if exists public.ar_upload_chunk(uuid, jsonb);
drop function if exists public.ar_upload_finish(uuid);
drop table if exists private.ar_invoices_staging;
drop table if exists private.ar_upload_batches;
drop table public.ar_invoices cascade;     -- ikut: v_collection_rows, v_note_latest, v_collection_summary, 3 policy insert
drop function if exists public.m10_aging_stage(uuid, jsonb);
drop function if exists public.m10_aging_commit(uuid, text);
drop table if exists private.m10_aging_staging;
drop table public.m10_aging cascade;       -- ikut: v_m10_gr, v_m10_kwitansi, v_m10_worksheet

-- Snapshot terkini = bulan terbaru.
create or replace view public.v_aging_current with (security_invoker = true) as
select l.*, s.month, s.as_of, s.created_at as uploaded_at
from public.ar_aging_lines l
join public.ar_aging_snapshots s on s.id = l.snapshot_id
where s.id = (select id from public.ar_aging_snapshots order by month desc limit 1);

-- Pengganti tabel ar_invoices (nama & kolom sama): filter Collection lama (whitelist
-- marketing + invoice date setelah cutoff), invoice ganda → baris pertama yang lolos.
create view public.ar_invoices with (security_invoker = true) as
select distinct on (c.invoice_no)
       c.invoice_no, c.payment_group, c.marketing, c.collection_name, c.business_partner,
       c.bp_key as bp_value, c.invoice_date, c.due_date, c.open_amt, c.no_po, c.no_sj, c.uploaded_at
from public.v_aging_current c
cross join (select value from public.app_settings where key = 'collection_filter') f
where nullif(trim(c.invoice_no), '') is not null
  and c.marketing in (select jsonb_array_elements_text(f.value->'marketing'))
  and c.invoice_date > (f.value->>'after')::date
order by c.invoice_no, c.line_no;

-- Pengganti tabel m10_aging: baris Tax Name Mitra10 dari snapshot terkini.
create view public.m10_aging with (security_invoker = true) as
select c.line_no as id, c.payment_group, c.marketing, c.collection_name, c.sales_name, c.business_partner,
       c.tax_name, c.invoice_no, c.invoice_date, c.due_date, c.open_amt, c.cur_0_30, c.cur_31_60,
       c.due_1_7, c.due_8_30, c.due_31_60, c.due_61_90, c.due_90, c.days, c.branch, c.no_po, c.no_sj
from public.v_aging_current c
where lower(trim(c.tax_name)) = lower(trim((select value #>> '{}' from public.app_settings where key = 'm10_tax_name')));

-- ── View Collection dibuat ulang (definisi sama dengan 0005/0006) ──
create view public.v_collection_rows with (security_invoker = true) as
select a.invoice_no, a.payment_group, a.marketing, a.collection_name, a.business_partner, a.bp_value,
       a.invoice_date, a.due_date, a.open_amt, a.no_po, a.no_sj,
       n.catatan, p.promise_date as janji_bayar, x.metode as metode_tukar, x.tanggal as tanggal_tukar,
       coalesce(x.keterangan, x.resi) as keterangan, x.resi, x.foto_path
from public.ar_invoices a
left join lateral (
  select '[' || notes.kategori || ']' || coalesce(' - ' || nullif(notes.isi, ''), '') as catatan
  from public.notes where notes.invoice_no = a.invoice_no order by notes.id desc limit 1) n on true
left join lateral (
  select payment_promises.promise_date from public.payment_promises
  where payment_promises.invoice_no = a.invoice_no order by payment_promises.id desc limit 1) p on true
left join lateral (
  select e.metode, e.tanggal, e.keterangan, e.resi, e.foto_path from public.invoice_exchanges e
  where e.invoice_no = a.invoice_no
  order by array_position(array['Kolektor', 'Ekspedisi', 'Sistem', 'WA', 'Email'], e.metode), e.id limit 1) x on true
where a.open_amt > 1000;

create view public.v_note_latest with (security_invoker = true) as
select distinct on (n.invoice_no) n.id, n.invoice_no, n.kategori, n.business_partner, n.isi, n.collection_name,
       n.invoice_date, n.no_po, n.no_sj, n.done, n.closed_by, n.closed_at, n.created_at,
       coalesce(a.open_amt, 0) as nominal
from public.notes n
left join public.ar_invoices a on a.invoice_no = n.invoice_no
order by n.invoice_no, n.id desc;

create view public.v_collection_summary with (security_invoker = true) as
select collection_name, count(*) as invoices, sum(open_amt) as total
from public.ar_invoices
where open_amt > 1000 and collection_name is not null and collection_name <> ''
group by collection_name;

create policy "tambah catatan untuk invoice sendiri" on public.notes for insert to authenticated
  with check (private.can_see_collection(collection_name) and exists (
    select 1 from public.ar_invoices a where a.invoice_no = notes.invoice_no and a.collection_name = notes.collection_name));
create policy "tambah janji bayar untuk invoice sendiri" on public.payment_promises for insert to authenticated
  with check (private.can_see_collection(collection_name) and exists (
    select 1 from public.ar_invoices a where a.invoice_no = payment_promises.invoice_no and a.collection_name = payment_promises.collection_name));
create policy "catat tukar via WA/Email" on public.invoice_exchanges for insert to authenticated
  with check (metode = any (array['WA', 'Email']) and private.can_see_collection(collection_name) and exists (
    select 1 from public.ar_invoices a where a.invoice_no = invoice_exchanges.invoice_no and a.collection_name = invoice_exchanges.collection_name));

-- ── View Mitra10 dibuat ulang (definisi sama dengan 0012) ─────────
create view public.v_m10_gr with (security_invoker = true) as
select g.*,
       coalesce(a.no_po, 'Kosong') as po_aging,
       case when upper(coalesce(g.po_no, '')) = upper(coalesce(a.no_po, 'Kosong')) then 'Done' else 'Check' end as check_status
from public.m10_gr g
left join lateral (select x.no_po from public.m10_aging x where x.no_sj = g.sj_no order by x.id limit 1) a on true;

create view public.v_m10_kwitansi with (security_invoker = true) as
select k.*, s.jadwal_transfer as jadwal_bayar, coalesce(a.open_amt, 0) as aging, k.total_net - coalesce(a.open_amt, 0) as selisih
from public.m10_kwitansi k
left join public.m10_payment_schedule s on s.no_kw = k.kuitansi_no
left join lateral (select x.open_amt from public.m10_aging x where x.invoice_no = k.vendor_invoice_no order by x.id limit 1) a on true;

create view public.v_m10_worksheet with (security_invoker = true) as
select w.id, coalesce(u.username, 'kosong') as username,
       w.business_partner, w.invoice_no, w.invoice_date, w.due_date, w.open_amt, w.branch, w.no_po, w.no_sj,
       case when exists (select 1 from public.m10_gr g where g.sj_no = w.no_sj) then 'Done' else 'Pending' end as gr,
       case when coalesce(kt.total, 0) > 10000 then 'Done' else 'Pending' end as tukar_faktur,
       w.open_amt - coalesce(kt.total, 0) as selisih,
       w.keterangan,
       case when exists (select 1 from public.m10_aging a where a.invoice_no = w.invoice_no) then 'Outstanding' else 'Lunas' end as status,
       k1.jadwal_bayar,
       k1.kuitansi_date - w.invoice_date as lama_tf
from public.m10_worksheet w
left join public.m10_bp_users u on u.business_partner = w.business_partner
left join lateral (select sum(k.total_net) as total from public.m10_kwitansi k where k.vendor_invoice_no = w.invoice_no) kt on true
left join lateral (
  select k.kuitansi_date, s.jadwal_transfer as jadwal_bayar
  from public.m10_kwitansi k left join public.m10_payment_schedule s on s.no_kw = k.kuitansi_no
  where k.vendor_invoice_no = w.invoice_no order by k.id limit 1) k1 on true;

-- Commit aging: satu snapshot per bulan (snapshot baru di bulan yang sama menggantikan),
-- lalu efek ke menu lain: invoice baru → Kertas Kerja Mitra10, badge Collection, Presentasi dirty.
create or replace function public.aging_commit(p_batch uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  b private.upload_batches;
  v_as_of date; v_month text; v_snap bigint; v_rows integer; v_total numeric;
  v_prev_current bigint; v_is_current boolean; v_lunas integer := 0; v_new integer := 0;
  v_tax text := lower(trim((select value #>> '{}' from public.app_settings where key = 'm10_tax_name')));
begin
  b := private.take_batch(p_batch, 'aging');
  select max((u.data->>'invoice_date')::date) into v_as_of from private.upload_rows u where u.batch = p_batch;
  if v_as_of is null then
    raise exception 'Kolom Invoice Date tidak berisi tanggal yang bisa dibaca' using errcode = '22023';
  end if;
  v_month := to_char(v_as_of, 'YYYY-MM');
  select id into v_prev_current from public.ar_aging_snapshots order by month desc limit 1;

  delete from public.ar_aging_snapshots where month = v_month;
  insert into public.ar_aging_snapshots (month, as_of, file_name) values (v_month, v_as_of, b.file_name)
  returning id into v_snap;
  insert into public.ar_aging_lines (snapshot_id, line_no, payment_group, limit_group, marketing, collection_name,
    sales_name, bp_key, business_partner, tax_name, invoice_no, invoice_date, due_date, open_amt, cur_0_30, cur_31_60,
    due_1_7, due_8_30, due_31_60, due_61_90, due_90, days, branch, follow_up, no_po, no_sj, area)
  select v_snap, u.seq, r.payment_group, r.limit_group, r.marketing, r.collection_name, r.sales_name, r.bp_key,
    r.business_partner, r.tax_name, nullif(trim(r.invoice_no), ''), r.invoice_date, r.due_date, coalesce(r.open_amt, 0),
    coalesce(r.cur_0_30, 0), coalesce(r.cur_31_60, 0), coalesce(r.due_1_7, 0), coalesce(r.due_8_30, 0),
    coalesce(r.due_31_60, 0), coalesce(r.due_61_90, 0), coalesce(r.due_90, 0), r.days, r.branch, r.follow_up,
    r.no_po, r.no_sj, r.area
  from private.upload_rows u
  cross join lateral jsonb_to_record(u.data) as r(payment_group text, limit_group text, marketing text,
    collection_name text, sales_name text, bp_key text, business_partner text, tax_name text, invoice_no text,
    invoice_date date, due_date date, open_amt numeric, cur_0_30 numeric, cur_31_60 numeric, due_1_7 numeric,
    due_8_30 numeric, due_31_60 numeric, due_61_90 numeric, due_90 numeric, days integer, branch text,
    follow_up text, no_po text, no_sj text, area text)
  where u.batch = p_batch;
  get diagnostics v_rows = row_count;
  select coalesce(sum(open_amt), 0) into v_total from public.ar_aging_lines where snapshot_id = v_snap;
  update public.ar_aging_snapshots set row_count = v_rows, total_open = v_total where id = v_snap;
  delete from private.upload_batches where id = p_batch;

  v_is_current := v_snap = (select id from public.ar_aging_snapshots order by month desc limit 1);
  if v_is_current then
    -- Mitra10: invoice yang hilang dari aging (dibanding snapshot terkini sebelumnya) = Lunas.
    if v_prev_current is not null then
      select count(distinct upper(o.invoice_no)) into v_lunas
      from public.ar_aging_lines o
      where o.snapshot_id = v_prev_current and lower(trim(o.tax_name)) = v_tax and o.invoice_no is not null
        and not exists (select 1 from public.ar_aging_lines n where n.snapshot_id = v_snap and upper(n.invoice_no) = upper(o.invoice_no));
    end if;
    v_new := private.m10_append_from_aging();
    update public.data_versions set updated_at = now() where key = 'ar_invoices';
    insert into public.app_settings (key, value, updated_by) values ('last_tagihan_update', to_jsonb(now()), (select auth.uid()))
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  end if;

  insert into public.deck_dirty (kind, month) values ('aging', v_month) on conflict (kind, month) do update set at = now();
  insert into public.import_log (module, kind, file_name, months, rows, user_id, file_sha256)
  values ('data', 'aging', b.file_name, array[v_month], v_rows, (select auth.uid()), b.sha256);
  return jsonb_build_object('rows', v_rows, 'month', v_month, 'asOf', v_as_of, 'totalOpen', v_total,
    'current', v_is_current, 'collectionRows', (select count(*) from public.ar_invoices),
    'm10Rows', (select count(*) from public.m10_aging), 'm10NewInvoices', v_new, 'm10Lunas', v_lunas);
end;
$$;

-- m10_dashboard: waktu update aging dari snapshot (bukan log Mitra10 lagi).
create or replace function public.m10_dashboard(p_month text)
returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_months text[];
  v_month text := p_month;
  v_start date; v_end date;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_cur date; v_prev date;
  v_res jsonb;
begin
  if not private.has_menu('rek.mitra10') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  select array_agg(m order by m) into v_months
  from (select distinct to_char(invoice_date, 'YYYY-MM') as m from public.m10_worksheet where invoice_date is not null) x;
  if v_months is null then v_months := array[]::text[]; end if;
  if v_month is null or not (v_month = any(v_months)) then
    v_month := coalesce(v_months[array_length(v_months, 1)], to_char(v_today, 'YYYY-MM'));
  end if;
  v_start := (v_month || '-01')::date;
  v_end := (v_start + interval '1 month' - interval '1 day')::date;
  v_cur := date_trunc('month', v_today)::date;
  v_prev := (v_cur - interval '1 month')::date;

  with w as materialized (select * from public.v_m10_worksheet)
  select jsonb_build_object(
    'month', v_month,
    'months', to_jsonb(v_months),
    'summary', (select jsonb_build_object(
        'total', count(*),
        'outstanding', count(*) filter (where status = 'Outstanding'),
        'openOutstanding', coalesce(sum(open_amt) filter (where status = 'Outstanding'), 0),
        'lunas', count(*) filter (where status = 'Lunas'),
        'grPending', count(*) filter (where gr = 'Pending' and status = 'Outstanding'),
        'siapTukar', count(*) filter (where gr = 'Done' and tukar_faktur = 'Pending' and status = 'Outstanding'),
        'tfDone', count(*) filter (where tukar_faktur = 'Done'),
        'selisihNonZero', count(*) filter (where tukar_faktur = 'Done' and selisih <> 0),
        'ltkp', count(*) filter (where upper(trim(keterangan)) = 'LTKP'),
        'litigasi', count(*) filter (where upper(trim(keterangan)) = 'LITIGASI'),
        'pendingPrev', count(*) filter (where tukar_faktur = 'Pending' and invoice_date >= v_prev and invoice_date < v_cur),
        'pendingCur', count(*) filter (where tukar_faktur = 'Pending' and invoice_date >= v_cur and invoice_date < (v_cur + interval '1 month')::date)
      ) from w),
    'prevMonth', to_char(v_prev, 'YYYY-MM'),
    'curMonth', to_char(v_cur, 'YYYY-MM'),
    'grCheck', (select count(*) from public.v_m10_gr where check_status = 'Check'),
    'agingNotInWorksheet', (select count(*) from public.m10_aging a
                            where not exists (select 1 from public.m10_worksheet x where upper(x.no_sj) = upper(a.no_sj))),
    'aging', (select jsonb_build_object(
        'count', count(invoice_no),
        'totalOpen', coalesce(sum(open_amt), 0),
        'buckets', jsonb_build_array(
          jsonb_build_object('label', 'Current 0 - 30', 'value', coalesce(sum(cur_0_30), 0)),
          jsonb_build_object('label', 'Current 31 - 60', 'value', coalesce(sum(cur_31_60), 0)),
          jsonb_build_object('label', 'Due + 1 - 7', 'value', coalesce(sum(due_1_7), 0)),
          jsonb_build_object('label', 'Due + 8 - 30', 'value', coalesce(sum(due_8_30), 0)),
          jsonb_build_object('label', 'Due + 31 - 60', 'value', coalesce(sum(due_31_60), 0)),
          jsonb_build_object('label', 'Due + 61 - 90', 'value', coalesce(sum(due_61_90), 0)),
          jsonb_build_object('label', 'Due + > 90', 'value', coalesce(sum(due_90), 0))),
        'avgDays', coalesce(round(avg(days), 1), 0)
      ) from public.m10_aging),
    'monthly', (select coalesce(jsonb_agg(jsonb_build_object(
        'month', m, 'invoice', n, 'done', done, 'avgLama', avg_lama) order by m), '[]')
      from (select to_char(invoice_date, 'YYYY-MM') as m, count(*) as n,
                   count(*) filter (where tukar_faktur = 'Done') as done,
                   round(avg(lama_tf), 1) as avg_lama
            from w where invoice_date is not null group by 1) x),
    'daily', (select jsonb_agg(jsonb_build_object(
        'date', g.d::date, 'invoice', coalesce(n, 0), 'done', coalesce(done, 0), 'avgLama', avg_lama,
        'jadwal', coalesce(jadwal, 0)) order by g.d)
      from generate_series(v_start, v_end, interval '1 day') as g(d)
      left join lateral (
        select count(*) as n, count(*) filter (where tukar_faktur = 'Done') as done, round(avg(lama_tf), 1) as avg_lama
        from w where invoice_date = g.d::date) a on true
      left join lateral (
        select sum(open_amt) as jadwal from w where jadwal_bayar = g.d::date) b on true),
    'scheduleAvgDays', (select round(avg(jadwal_transfer - tgl_tukar_faktur), 1) from public.m10_payment_schedule),
    'lastAging', (select max(created_at) from public.ar_aging_snapshots)
  ) into v_res;
  return v_res;
end;
$$;

-- ══ LAPORAN INVOICE & PAYMENT DATE COMPARISON ════════════════════
drop function if exists public.erp_invoice_import(jsonb, text);
drop function if exists public.erp_payment_import(jsonb, text);
drop table public.erp_invoices;
drop table public.erp_payments;

create table public.erp_invoices (
  invoice_no      text primary key,
  bp_key          text,
  bp_name         text,
  bp_location     text,
  bp_group        text,               -- Payment group (kolom "BP Group" atau filter "Payment Group" laporan)
  marketing_group text,
  branch          text,
  payment_term    text,
  credit_limit    numeric(18,2),
  invoice_date    date not null,
  due_date        date,
  amount          numeric(18,2) not null default 0,
  po_customer     text,
  updated_at      timestamptz not null default now()
);
create index erp_invoices_date_idx on public.erp_invoices (invoice_date);
create index erp_invoices_po_idx on public.erp_invoices (po_customer);
create index erp_invoices_bp_idx on public.erp_invoices (bp_key);

create table public.erp_payments (
  id           bigint generated always as identity primary key,
  invoice_no   text not null,
  payment_doc  text not null default '',
  payment_bank text,
  payment_date date not null,
  amount       numeric(18,2) not null default 0,
  unique (invoice_no, payment_doc)
);
create index erp_payments_date_idx on public.erp_payments (payment_date);

alter table public.erp_invoices enable row level security;
alter table public.erp_payments enable row level security;
create policy "baca invoice erp" on public.erp_invoices for select to authenticated
  using (private.has_menu('rek.mutasi') or private.has_menu('lap.presentasi') or private.has_menu('rek.marketplace'));
create policy "baca payment erp" on public.erp_payments for select to authenticated
  using (private.has_menu('rek.mutasi') or private.has_menu('lap.presentasi') or private.has_menu('rek.marketplace'));

-- Merge satu file laporan (dari menu mana pun):
--   invoice di-upsert per invoice_no, payment per (invoice_no, payment_doc).
--   Penghapusan data yang tidak ada lagi di file (koreksi/pembatalan):
--     meta.kind='invoice' → invoice pada periode file (rentang "Date" laporan, atau set tanggal
--        invoice di file bila tanpa rentang) yang tidak ada di file dihapus;
--     meta.kind='payment' → payment pada periode file yang tidak ada di file dihapus.
--   Bila laporan difilter Payment Group, penghapusan hanya untuk invoice di file.
create or replace function public.erp_commit(p_batch uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  b private.upload_batches;
  v_kind text; v_group text; v_dari date; v_ke date; v_scoped boolean;
  v_inv integer; v_pay integer; v_del_inv integer := 0; v_del_pay integer := 0; v_months text[];
begin
  b := private.take_batch(p_batch, 'erp');
  v_kind := coalesce(b.meta->>'kind', 'invoice');
  v_group := nullif(trim(b.meta->>'paymentGroup'), '');
  v_dari := nullif(b.meta->>'dari', '')::date;
  v_ke := nullif(b.meta->>'ke', '')::date;
  v_scoped := v_group is not null;

  drop table if exists pg_temp._erp;
  create temp table _erp on commit drop as
  select u.seq, trim(r.invoice_no) as invoice_no, nullif(trim(r.bp_key), '') as bp_key, r.bp_name, r.bp_location,
         coalesce(nullif(trim(r.bp_group), ''), v_group) as bp_group, r.marketing_group, r.branch, r.payment_term,
         r.credit_limit, r.invoice_date, r.due_date, r.amount, nullif(nullif(trim(r.po_customer), ''), '-') as po_customer,
         coalesce(trim(r.payment_doc), '') as payment_doc, r.payment_bank, r.payment_date, r.payment_amount
  from private.upload_rows u
  cross join lateral jsonb_to_record(u.data) as r(invoice_no text, bp_key text, bp_name text, bp_location text,
    bp_group text, marketing_group text, branch text, payment_term text, credit_limit numeric, invoice_date date,
    due_date date, amount numeric, po_customer text, payment_doc text, payment_bank text, payment_date date,
    payment_amount numeric)
  where u.batch = p_batch and nullif(trim(r.invoice_no), '') is not null;

  -- Invoice: baris pertama per invoice (baris berikutnya = pembayaran berikutnya).
  insert into public.erp_invoices as e (invoice_no, bp_key, bp_name, bp_location, bp_group, marketing_group, branch,
    payment_term, credit_limit, invoice_date, due_date, amount, po_customer)
  select distinct on (invoice_no) invoice_no, bp_key, bp_name, bp_location, bp_group, marketing_group, branch,
    payment_term, credit_limit, invoice_date, due_date, coalesce(amount, 0), po_customer
  from _erp where invoice_date is not null
  order by invoice_no, seq
  on conflict (invoice_no) do update set
    bp_key = coalesce(excluded.bp_key, e.bp_key), bp_name = coalesce(excluded.bp_name, e.bp_name),
    bp_location = coalesce(excluded.bp_location, e.bp_location), bp_group = coalesce(excluded.bp_group, e.bp_group),
    marketing_group = coalesce(excluded.marketing_group, e.marketing_group), branch = coalesce(excluded.branch, e.branch),
    payment_term = coalesce(excluded.payment_term, e.payment_term), credit_limit = coalesce(excluded.credit_limit, e.credit_limit),
    invoice_date = excluded.invoice_date, due_date = coalesce(excluded.due_date, e.due_date),
    amount = excluded.amount, po_customer = coalesce(excluded.po_customer, e.po_customer), updated_at = now();
  get diagnostics v_inv = row_count;

  insert into public.erp_payments as p (invoice_no, payment_doc, payment_bank, payment_date, amount)
  select distinct on (invoice_no, payment_doc) invoice_no, payment_doc, payment_bank, payment_date, coalesce(payment_amount, 0)
  from _erp where payment_date is not null
  order by invoice_no, payment_doc, seq
  on conflict (invoice_no, payment_doc) do update set
    payment_bank = coalesce(excluded.payment_bank, p.payment_bank), payment_date = excluded.payment_date, amount = excluded.amount;
  get diagnostics v_pay = row_count;

  if v_kind = 'invoice' then
    delete from public.erp_invoices e
    where (case when v_dari is not null and v_ke is not null then e.invoice_date between v_dari and v_ke
                else e.invoice_date in (select invoice_date from _erp where invoice_date is not null) end)
      and (not v_scoped or e.bp_group = v_group)
      and not exists (select 1 from _erp x where x.invoice_no = e.invoice_no);
    get diagnostics v_del_inv = row_count;
  else
    delete from public.erp_payments p
    where (case when v_dari is not null and v_ke is not null then p.payment_date between v_dari and v_ke
                else p.payment_date in (select payment_date from _erp where payment_date is not null) end)
      and (not v_scoped or p.invoice_no in (select invoice_no from _erp))
      and not exists (select 1 from _erp x where x.invoice_no = p.invoice_no and x.payment_doc = p.payment_doc);
    get diagnostics v_del_pay = row_count;
  end if;
  delete from private.upload_batches where id = p_batch;

  -- Presentasi: bulan invoice & bulan payment yang tersentuh dihitung ulang.
  insert into public.deck_dirty (kind, month)
  select distinct 'invoice', to_char(invoice_date, 'YYYY-MM') from _erp where invoice_date is not null
  union select distinct 'payment', to_char(payment_date, 'YYYY-MM') from _erp where payment_date is not null
  on conflict (kind, month) do update set at = now();

  select array_agg(distinct m order by m) into v_months from (
    select to_char(coalesce(invoice_date, payment_date), 'YYYY-MM') as m from _erp) x where m is not null;
  insert into public.import_log (module, kind, file_name, months, rows, user_id, file_sha256)
  values ('data', 'erp', b.file_name, v_months, v_inv + v_pay, (select auth.uid()), b.sha256);
  return jsonb_build_object('invoices', v_inv, 'payments', v_pay, 'deletedInvoices', v_del_inv,
    'deletedPayments', v_del_pay, 'months', to_jsonb(v_months), 'kind', v_kind);
end;
$$;

-- Presentasi: baris sumber per bulan untuk parser lama (invoice + tanggal bayar terakhir).
create view public.v_deck_invoices with (security_invoker = true) as
select i.*, (select max(p.payment_date) from public.erp_payments p where p.invoice_no = i.invoice_no) as last_payment_date
from public.erp_invoices i;

create view public.v_deck_payments with (security_invoker = true) as
select p.invoice_no, p.payment_doc, p.payment_date, p.amount as payment_amount,
       i.bp_key, i.bp_name, i.bp_group, i.marketing_group, i.payment_term, i.invoice_date, i.due_date
from public.erp_payments p
left join public.erp_invoices i on i.invoice_no = p.invoice_no;

-- Marketplace: baris ERP untuk laporan (per pesanan lewat PO customer + invoice subsidi tanpa PO
-- pada Payment Group & periode laporan). Bentuk sama dengan hasil parseErp lama.
create or replace function public.mp_erp_rows(p_pos text[], p_group text, p_dari date, p_ke date)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'bpName', i.bp_name, 'lokasi', i.bp_location, 'cabang', i.branch, 'invoiceNo', i.invoice_no,
    'invoiceAmount', i.amount, 'invoiceDate', i.invoice_date, 'paymentDoc', p.payment_doc,
    'paymentAmount', coalesce(p.amount, 0), 'paymentDate', p.payment_date,
    'hari', p.payment_date - i.invoice_date, 'no', coalesce(i.po_customer, '')) order by i.invoice_date, i.invoice_no), '[]'::jsonb)
  from public.erp_invoices i
  left join public.erp_payments p on p.invoice_no = i.invoice_no
  where i.po_customer = any(p_pos)
     or (i.po_customer is null and nullif(trim(p_group), '') is not null
         and lower(i.bp_group) like lower(trim(p_group)) || '%'
         and i.invoice_date between coalesce(p_dari, '-infinity'::date) and coalesce(p_ke, 'infinity'::date));
$$;

-- ── Hak eksekusi ─────────────────────────────────────────────────
revoke execute on function private.take_batch(uuid, text) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'public.upload_begin(text, text, text, jsonb)', 'public.upload_rows(uuid, integer, jsonb)',
    'public.bp_commit(uuid)', 'public.aging_commit(uuid)', 'public.erp_commit(uuid)',
    'public.mp_erp_rows(text[], text, date, date)', 'public.m10_dashboard(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

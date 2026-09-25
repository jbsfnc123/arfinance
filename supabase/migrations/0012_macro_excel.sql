-- 0012: Fase 5 — konversi macro Excel: Mutasi Bank vs Realisasi & Mitra10 Tukar Faktur.

-- ══ MUTASI BANK VS REALISASI ═════════════════════════════════════
-- Pengganti sheet Config (mdlConfig.bas).
create table public.bank_accounts (
  code   text primary key,
  last4  char(4) not null unique,
  sort   integer not null default 0,
  active boolean not null default true
);
insert into public.bank_accounts (code, last4, sort) values
  ('BCA-4888', '4888', 1), ('BCA-0780', '0780', 2), ('BCA-9797', '9797', 3),
  ('BRI-3309', '3309', 4), ('MDR-3435', '3435', 5);

-- Pengganti sheet MUT_<last4>: hanya baris CR (uang masuk).
create table public.bank_mutations (
  id         bigint generated always as identity primary key,
  account    text not null references public.bank_accounts(code) on update cascade,
  tx_date    date not null,
  amount     numeric(18,2) not null default 0,
  keterangan text,
  catatan    text
);
create index bank_mutations_account_date_idx on public.bank_mutations (account, tx_date);
create index bank_mutations_date_idx on public.bank_mutations (tx_date);

-- Pengganti sheet Invoice (invoice ERP yang dibuat).
create table public.erp_invoices (
  invoice_no   text primary key,
  invoice_date date not null,
  amount       numeric(18,2) not null default 0
);
create index erp_invoices_date_idx on public.erp_invoices (invoice_date);

-- Pengganti sheet Payment (alokasi pembayaran ERP).
create table public.erp_payments (
  id           bigint generated always as identity primary key,
  invoice_no   text,
  payment_doc  text,
  payment_date date not null,
  amount       numeric(18,2) not null default 0
);
create index erp_payments_date_idx on public.erp_payments (payment_date);
create index erp_payments_invoice_idx on public.erp_payments (invoice_no);

alter table public.bank_accounts  enable row level security;
alter table public.bank_mutations enable row level security;
alter table public.erp_invoices   enable row level security;
alter table public.erp_payments   enable row level security;
create policy "baca rekening" on public.bank_accounts
  for select to authenticated using (private.has_menu('rek.mutasi'));
create policy "sa kelola rekening" on public.bank_accounts
  for all to authenticated using (private.is_sa()) with check (private.is_sa());
create policy "baca mutasi" on public.bank_mutations
  for select to authenticated using (private.has_menu('rek.mutasi'));
create policy "baca invoice erp" on public.erp_invoices
  for select to authenticated using (private.has_menu('rek.mutasi'));
create policy "baca payment erp" on public.erp_payments
  for select to authenticated using (private.has_menu('rek.mutasi'));

-- Import mutasi satu file (port ImportMutasiWorkbook). p_sheets = [{account, dates[], rows[]}]:
-- baris lama rekening itu pada tanggal yang tercakup file (termasuk rentang "Periode") dihapus,
-- lalu baris baru ditambahkan. Upload ulang file yang sama tidak menggandakan data.
create or replace function public.mutasi_import(p_sheets jsonb, p_file_name text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  s jsonb;
  v_count integer := 0;
  v_n integer;
  v_months text[];
begin
  if not private.has_menu('rek.mutasi') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  for s in select * from jsonb_array_elements(p_sheets) loop
    if not exists (select 1 from public.bank_accounts where code = s->>'account') then
      raise exception 'Rekening % tidak terdaftar', s->>'account' using errcode = '22023';
    end if;
    delete from public.bank_mutations
    where account = s->>'account'
      and tx_date in (select jsonb_array_elements_text(s->'dates')::date);
    insert into public.bank_mutations (account, tx_date, amount, keterangan, catatan)
    select s->>'account', r.tx_date, coalesce(r.amount, 0), left(r.keterangan, 80), left(r.catatan, 120)
    from jsonb_to_recordset(s->'rows') as r(tx_date date, amount numeric, keterangan text, catatan text)
    where r.tx_date is not null;
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;
  end loop;

  select array_agg(distinct to_char(r.tx_date, 'YYYY-MM') order by to_char(r.tx_date, 'YYYY-MM'))
  into v_months
  from jsonb_array_elements(p_sheets) s2,
       jsonb_to_recordset(s2->'rows') as r(tx_date date);
  insert into public.import_log (module, kind, file_name, months, rows, user_id)
  values ('mutasi', 'mutasi', p_file_name, v_months, v_count, (select auth.uid()));
  return v_count;
end;
$$;

-- Import invoice (port ImportInvoiceFiles): hapus baris lama yang tanggalnya ada di file
-- ATAU nomor invoicenya ada di file, lalu tambahkan. Invoice ganda dalam file: pertama menang.
create or replace function public.erp_invoice_import(p_rows jsonb, p_file_name text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer; v_months text[];
begin
  if not private.has_menu('rek.mutasi') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  drop table if exists pg_temp._inv;
  create temp table _inv on commit drop as
  select distinct on (trim(r.invoice_no)) trim(r.invoice_no) as invoice_no, r.invoice_date, coalesce(r.amount, 0) as amount
  from rows from (jsonb_to_recordset(p_rows) as (invoice_no text, invoice_date date, amount numeric))
       with ordinality as r(invoice_no, invoice_date, amount, ord)
  where nullif(trim(r.invoice_no), '') is not null and r.invoice_date is not null
  order by trim(r.invoice_no), r.ord;

  delete from public.erp_invoices e
  where e.invoice_date in (select distinct invoice_date from _inv)
     or e.invoice_no in (select invoice_no from _inv);
  insert into public.erp_invoices (invoice_no, invoice_date, amount)
  select invoice_no, invoice_date, amount from _inv;
  get diagnostics v_count = row_count;

  select array_agg(distinct to_char(invoice_date, 'YYYY-MM')) into v_months from _inv;
  insert into public.import_log (module, kind, file_name, months, rows, user_id)
  values ('mutasi', 'invoice', p_file_name, v_months, v_count, (select auth.uid()));
  return v_count;
end;
$$;

-- Import payment (port ImportPaymentFiles): ganti semua baris pada tanggal yang ada di file.
create or replace function public.erp_payment_import(p_rows jsonb, p_file_name text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer; v_months text[];
begin
  if not private.has_menu('rek.mutasi') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  drop table if exists pg_temp._pay;
  create temp table _pay on commit drop as
  select nullif(trim(r.invoice_no), '') as invoice_no, nullif(trim(r.payment_doc), '') as payment_doc,
         r.payment_date, r.amount
  from jsonb_to_recordset(p_rows) as r(invoice_no text, payment_doc text, payment_date date, amount numeric)
  where r.payment_date is not null and coalesce(r.amount, 0) <> 0;

  delete from public.erp_payments where payment_date in (select distinct payment_date from _pay);
  insert into public.erp_payments (invoice_no, payment_doc, payment_date, amount)
  select invoice_no, payment_doc, payment_date, amount from _pay;
  get diagnostics v_count = row_count;

  select array_agg(distinct to_char(payment_date, 'YYYY-MM')) into v_months from _pay;
  insert into public.import_log (module, kind, file_name, months, rows, user_id)
  values ('mutasi', 'payment', p_file_name, v_months, v_count, (select auth.uid()));
  return v_count;
end;
$$;

-- Dashboard satu bulan (port mdlDashboard.bas). Target = ar_targets bulan itu (sama dengan
-- sheet Target lama). Allocated in Target = payment bulan itu yang invoicenya ada di target
-- bulan yang sama. Kumulatif & rasio dihitung di browser (lib/modules/mutasi).
create or replace function public.mutasi_dashboard(p_month text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_start date; v_end date; v_res jsonb;
begin
  if not private.has_menu('rek.mutasi') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if p_month !~ '^\d{4}-\d{2}$' then
    raise exception 'Format bulan harus YYYY-MM' using errcode = '22023';
  end if;
  v_start := (p_month || '-01')::date;
  v_end := (v_start + interval '1 month' - interval '1 day')::date;

  with days as (
    select generate_series(v_start, v_end, interval '1 day')::date as d
  ), mut as (
    select tx_date as d, jsonb_object_agg(account, amt) as per_account
    from (select account, tx_date, sum(amount) as amt from public.bank_mutations
          where tx_date between v_start and v_end group by 1, 2) x
    group by tx_date
  ), pay as (
    select p.payment_date as d, sum(p.amount) as alloc,
           coalesce(sum(p.amount) filter (where t.invoice_no is not null), 0) as alloc_t
    from public.erp_payments p
    left join public.ar_targets t on t.month = p_month and t.invoice_no = p.invoice_no
    where p.payment_date between v_start and v_end
    group by 1
  ), inv as (
    select invoice_date as d, sum(amount) as amt from public.erp_invoices
    where invoice_date between v_start and v_end group by 1
  )
  select jsonb_build_object(
    'accounts', (select coalesce(jsonb_agg(code order by sort, code), '[]') from public.bank_accounts
                 where active or exists (select 1 from public.bank_mutations m
                                         where m.account = code and m.tx_date between v_start and v_end)),
    'target', (select coalesce(sum(target), 0) from public.ar_targets where month = p_month),
    'targetCount', (select count(*) from public.ar_targets where month = p_month),
    'days', (select jsonb_agg(jsonb_build_object(
               'date', days.d,
               'mut', coalesce(mut.per_account, '{}'::jsonb),
               'alloc', coalesce(pay.alloc, 0),
               'allocT', coalesce(pay.alloc_t, 0),
               'inv', coalesce(inv.amt, 0)) order by days.d)
             from days
             left join mut on mut.d = days.d
             left join pay on pay.d = days.d
             left join inv on inv.d = days.d),
    'months', (select jsonb_agg(m order by m desc) from (
                 select to_char(tx_date, 'YYYY-MM') as m from public.bank_mutations
                 union select to_char(invoice_date, 'YYYY-MM') from public.erp_invoices
                 union select to_char(payment_date, 'YYYY-MM') from public.erp_payments
                 union select month from public.ar_targets
                 union select to_char((now() at time zone 'Asia/Jakarta')::date, 'YYYY-MM')) x)
  ) into v_res;
  return v_res;
end;
$$;

-- Target bulanan kini juga boleh di-upload dari halaman Mutasi Bank (dulu sheet Target).
create or replace function public.ar_target_replace(p_month text, p_rows jsonb, p_file_name text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not (private.is_ctrl() and (private.has_menu('set.target') or private.has_menu('rek.mutasi'))) then
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

-- ══ MITRA10 TUKAR FAKTUR ═════════════════════════════════════════
-- Pengganti tabel Blank_A4 di sheet Data Aging (hanya Tax Name Mitra10; diganti penuh).
create table public.m10_aging (
  id               bigint generated always as identity primary key,
  payment_group    text,
  marketing        text,
  collection_name  text,
  sales_name       text,
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
  no_po            text,
  no_sj            text
);
create index m10_aging_invoice_idx on public.m10_aging (invoice_no);
create index m10_aging_sj_idx on public.m10_aging (no_sj);

create table private.m10_aging_staging (like public.m10_aging including defaults including identity);
alter table private.m10_aging_staging add column batch uuid not null, add column at timestamptz not null default now();
create index m10_aging_staging_batch_idx on private.m10_aging_staging (batch);

-- Pengganti tabel tblAdd (Business Partner → Username portal Mitra10).
create table public.m10_bp_users (
  business_partner text primary key,
  payment_group    text,
  username         text
);

-- Pengganti Kertas Kerja (Table1): kolom B..I disalin dari aging saat No SJ baru muncul;
-- Keterangan diisi manual. Kolom rumus ada di view v_m10_worksheet.
create table public.m10_worksheet (
  id               bigint generated always as identity primary key,
  business_partner text,
  invoice_no       text,
  invoice_date     date,
  due_date         date,
  open_amt         numeric(18,2) not null default 0,
  branch           text,
  no_po            text,
  no_sj            text not null,
  keterangan       text,
  created_at       timestamptz not null default now()
);
create unique index m10_worksheet_sj_key on public.m10_worksheet (upper(no_sj));
create index m10_worksheet_invoice_idx on public.m10_worksheet (invoice_no);
create index m10_worksheet_date_idx on public.m10_worksheet (invoice_date);

-- Pengganti GR Update (Table5). Kunci unik = GR No + Item Code (tidak peka huruf besar/kecil).
create table public.m10_gr (
  id             bigint generated always as identity primary key,
  no             text,
  store_no       text,
  delivery_to    text,
  gr_no          text,
  gr_date        text,
  po_no          text,
  po_date        text,
  vendor_ship_no text,
  item_code      text,
  item_name      text,
  uom            text,
  qty_order      numeric,
  qty_received   numeric,
  status         text,
  sj_no          text,
  created_at     timestamptz not null default now()
);
create unique index m10_gr_key on public.m10_gr (upper(coalesce(gr_no, '')), upper(coalesce(item_code, '')));
create index m10_gr_sj_idx on public.m10_gr (sj_no);

-- Pengganti KW Update (Table6). Kunci unik = Invoice No (portal).
create table public.m10_kwitansi (
  id                bigint generated always as identity primary key,
  username          text,
  invoice_no        text not null,
  vendor_invoice_no text,
  invoice_date      date,
  kuitansi_no       text,
  kuitansi_date     date,
  accepted_date     date,
  pfi_no            text,
  gr_no             text,
  po_no             text,
  total_net         numeric(18,2) not null default 0,
  created_at        timestamptz not null default now()
);
create unique index m10_kwitansi_key on public.m10_kwitansi (upper(invoice_no));
create index m10_kwitansi_vendor_idx on public.m10_kwitansi (vendor_invoice_no);
create index m10_kwitansi_kuitansi_idx on public.m10_kwitansi (kuitansi_no);

-- Pengganti sheet Jadwal bayar (tblJadwal).
create table public.m10_payment_schedule (
  no_kw            text primary key,
  spp              text,
  nilai_kw         numeric(18,2) not null default 0,
  tgl_tukar_faktur date,
  jadwal_transfer  date,
  notes            text
);

alter table public.m10_aging            enable row level security;
alter table public.m10_bp_users         enable row level security;
alter table public.m10_worksheet        enable row level security;
alter table public.m10_gr               enable row level security;
alter table public.m10_kwitansi         enable row level security;
alter table public.m10_payment_schedule enable row level security;
create policy "baca aging mitra10" on public.m10_aging
  for select to authenticated using (private.has_menu('rek.mitra10'));
create policy "baca username mitra10" on public.m10_bp_users
  for select to authenticated using (private.has_menu('rek.mitra10'));
create policy "baca kertas kerja mitra10" on public.m10_worksheet
  for select to authenticated using (private.has_menu('rek.mitra10'));
create policy "baca gr mitra10" on public.m10_gr
  for select to authenticated using (private.has_menu('rek.mitra10'));
create policy "baca kwitansi mitra10" on public.m10_kwitansi
  for select to authenticated using (private.has_menu('rek.mitra10'));
create policy "baca jadwal bayar mitra10" on public.m10_payment_schedule
  for select to authenticated using (private.has_menu('rek.mitra10'));

insert into public.app_settings (key, value) values
  ('m10_tax_name', to_jsonb('Catur Mitra Sejati Sentosa'::text))
on conflict (key) do nothing;

-- ── View: kolom rumus workbook ───────────────────────────────────
-- GR Update: PO Aging = XLOOKUP(SJ NO → No PO aging, "Kosong"); Check = PO No = PO Aging.
create view public.v_m10_gr with (security_invoker = true) as
select g.*,
       coalesce(a.no_po, 'Kosong') as po_aging,
       case when upper(coalesce(g.po_no, '')) = upper(coalesce(a.no_po, 'Kosong')) then 'Done' else 'Check' end as check_status
from public.m10_gr g
left join lateral (
  select x.no_po from public.m10_aging x where x.no_sj = g.sj_no order by x.id limit 1
) a on true;

-- KW Update: Jadwal Bayar dari tblJadwal (No KW); Aging = Open Amt aging (0 bila lunas);
-- Selisih = Total Net − Aging.
create view public.v_m10_kwitansi with (security_invoker = true) as
select k.*,
       s.jadwal_transfer as jadwal_bayar,
       coalesce(a.open_amt, 0) as aging,
       k.total_net - coalesce(a.open_amt, 0) as selisih
from public.m10_kwitansi k
left join public.m10_payment_schedule s on s.no_kw = k.kuitansi_no
left join lateral (
  select x.open_amt from public.m10_aging x where x.invoice_no = k.vendor_invoice_no order by x.id limit 1
) a on true;

-- Kertas Kerja (Table1):
--   Username     = XLOOKUP(BP → tblAdd, "kosong")
--   GR           = No SJ ada di GR Update → Done, selain itu Pending
--   Selisih      = Open Amt − Σ Total Net kwitansi (Vendor Invoice No = Invoice No)
--   Tukar Faktur = Open Amt − Selisih > 10.000 → Done (artinya Σ kwitansi > 10.000)
--   Status       = Invoice No masih ada di aging → Outstanding, selain itu Lunas
--   Jadwal Bayar & Lama TF = dari kwitansi pertama invoice itu
create view public.v_m10_worksheet with (security_invoker = true) as
select w.id,
       coalesce(u.username, 'kosong') as username,
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
left join lateral (
  select sum(k.total_net) as total from public.m10_kwitansi k where k.vendor_invoice_no = w.invoice_no
) kt on true
left join lateral (
  select k.kuitansi_date, s.jadwal_transfer as jadwal_bayar
  from public.m10_kwitansi k
  left join public.m10_payment_schedule s on s.no_kw = k.kuitansi_no
  where k.vendor_invoice_no = w.invoice_no
  order by k.id limit 1
) k1 on true;

-- ── RPC ──────────────────────────────────────────────────────────
-- Tambah invoice baru dari aging ke Kertas Kerja (port AppendNewInvoices): No SJ yang belum ada.
create or replace function private.m10_append_from_aging()
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  insert into public.m10_worksheet (business_partner, invoice_no, invoice_date, due_date, open_amt, branch, no_po, no_sj)
  select distinct on (upper(a.no_sj))
         a.business_partner, a.invoice_no, a.invoice_date, a.due_date, a.open_amt, a.branch, a.no_po, a.no_sj
  from public.m10_aging a
  where nullif(trim(a.no_sj), '') is not null
    and not exists (select 1 from public.m10_worksheet w where upper(w.no_sj) = upper(a.no_sj))
  order by upper(a.no_sj), a.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Upload aging bertahap: stage (per potongan) lalu commit (port UpdateMasterAging).
create or replace function public.m10_aging_stage(p_batch uuid, p_rows jsonb)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not private.has_menu('rek.mitra10') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  delete from private.m10_aging_staging where at < now() - interval '1 day';
  insert into private.m10_aging_staging (batch, payment_group, marketing, collection_name, sales_name,
    business_partner, tax_name, invoice_no, invoice_date, due_date, open_amt, cur_0_30, cur_31_60,
    due_1_7, due_8_30, due_31_60, due_61_90, due_90, days, branch, no_po, no_sj)
  select p_batch, r.payment_group, r.marketing, r.collection_name, r.sales_name, r.business_partner,
         r.tax_name, r.invoice_no, r.invoice_date, r.due_date, coalesce(r.open_amt, 0),
         coalesce(r.cur_0_30, 0), coalesce(r.cur_31_60, 0), coalesce(r.due_1_7, 0), coalesce(r.due_8_30, 0),
         coalesce(r.due_31_60, 0), coalesce(r.due_61_90, 0), coalesce(r.due_90, 0), r.days,
         r.branch, r.no_po, r.no_sj
  from jsonb_to_recordset(p_rows) as r(payment_group text, marketing text, collection_name text,
    sales_name text, business_partner text, tax_name text, invoice_no text, invoice_date date,
    due_date date, open_amt numeric, cur_0_30 numeric, cur_31_60 numeric, due_1_7 numeric,
    due_8_30 numeric, due_31_60 numeric, due_61_90 numeric, due_90 numeric, days integer,
    branch text, no_po text, no_sj text);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.m10_aging_commit(p_batch uuid, p_file_name text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_rows integer; v_old integer; v_lunas integer; v_new integer; v_total numeric;
begin
  if not private.has_menu('rek.mitra10') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  select count(*), coalesce(sum(open_amt), 0) into v_rows, v_total
  from private.m10_aging_staging where batch = p_batch;
  if v_rows = 0 then
    raise exception 'Tidak ada baris aging untuk disimpan' using errcode = '22023';
  end if;

  select count(*) into v_old from public.m10_aging;
  -- Invoice yang hilang dari aging baru = dianggap lunas.
  select count(distinct upper(o.invoice_no)) into v_lunas
  from public.m10_aging o
  where nullif(trim(o.invoice_no), '') is not null
    and not exists (select 1 from private.m10_aging_staging s
                    where s.batch = p_batch and upper(s.invoice_no) = upper(o.invoice_no));

  delete from public.m10_aging where true;
  insert into public.m10_aging (payment_group, marketing, collection_name, sales_name, business_partner,
    tax_name, invoice_no, invoice_date, due_date, open_amt, cur_0_30, cur_31_60, due_1_7, due_8_30,
    due_31_60, due_61_90, due_90, days, branch, no_po, no_sj)
  select payment_group, marketing, collection_name, sales_name, business_partner, tax_name, invoice_no,
         invoice_date, due_date, open_amt, cur_0_30, cur_31_60, due_1_7, due_8_30, due_31_60, due_61_90,
         due_90, days, branch, no_po, no_sj
  from private.m10_aging_staging where batch = p_batch order by id;
  delete from private.m10_aging_staging where batch = p_batch;

  v_new := private.m10_append_from_aging();
  insert into public.import_log (module, kind, file_name, rows, user_id)
  values ('mitra10', 'aging', p_file_name || ' | Invoice baru: ' || v_new || ' | Hilang dari aging: ' || v_lunas,
          v_rows, (select auth.uid()));
  return jsonb_build_object('rows', v_rows, 'oldRows', v_old, 'totalOpen', v_total,
                            'newInvoices', v_new, 'lunas', v_lunas);
end;
$$;

-- Tambah GR baru (port Update_GR_Data): baris dengan kunci GR No + Item Code yang sudah ada dilewati.
create or replace function public.m10_gr_add(p_rows jsonb, p_file_name text, p_first boolean)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not private.has_menu('rek.mitra10') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  insert into public.m10_gr (no, store_no, delivery_to, gr_no, gr_date, po_no, po_date, vendor_ship_no,
    item_code, item_name, uom, qty_order, qty_received, status, sj_no)
  select r.no, r.store_no, r.delivery_to, r.gr_no, r.gr_date, r.po_no, r.po_date, r.vendor_ship_no,
         r.item_code, r.item_name, r.uom, r.qty_order, r.qty_received, r.status, r.sj_no
  from jsonb_to_recordset(p_rows) as r(no text, store_no text, delivery_to text, gr_no text, gr_date text,
    po_no text, po_date text, vendor_ship_no text, item_code text, item_name text, uom text,
    qty_order numeric, qty_received numeric, status text, sj_no text)
  where nullif(r.gr_no, '') is not null or nullif(r.item_code, '') is not null
  on conflict do nothing;
  get diagnostics v_count = row_count;
  if p_first then
    insert into public.import_log (module, kind, file_name, rows, user_id)
    values ('mitra10', 'gr', p_file_name, v_count, (select auth.uid()));
  else
    update public.import_log set rows = rows + v_count
    where id = (select max(id) from public.import_log
                where module = 'mitra10' and kind = 'gr' and user_id = (select auth.uid()));
  end if;
  return v_count;
end;
$$;

-- Import kwitansi (port UpdateDataKwitansi): Invoice No yang sudah ada dilewati.
create or replace function public.m10_kw_add(p_rows jsonb, p_username text, p_file_name text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer; v_total integer;
begin
  if not private.has_menu('rek.mitra10') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  select count(*) into v_total from jsonb_array_elements(p_rows);
  insert into public.m10_kwitansi (username, invoice_no, vendor_invoice_no, invoice_date, kuitansi_no,
    kuitansi_date, accepted_date, pfi_no, gr_no, po_no, total_net)
  select nullif(trim(p_username), ''), trim(r.invoice_no), r.vendor_invoice_no, r.invoice_date, r.kuitansi_no,
         r.kuitansi_date, r.accepted_date, r.pfi_no, r.gr_no, r.po_no, coalesce(r.total_net, 0)
  from jsonb_to_recordset(p_rows) as r(invoice_no text, vendor_invoice_no text, invoice_date date,
    kuitansi_no text, kuitansi_date date, accepted_date date, pfi_no text, gr_no text, po_no text,
    total_net numeric)
  where nullif(trim(r.invoice_no), '') is not null
  on conflict do nothing;
  get diagnostics v_count = row_count;
  insert into public.import_log (module, kind, file_name, rows, user_id)
  values ('mitra10', 'kwitansi',
          coalesce(nullif(trim(p_username), ''), '-') || ' | ' || p_file_name || ' | dilewati (sudah ada): ' || (v_total - v_count),
          v_count, (select auth.uid()));
  return jsonb_build_object('added', v_count, 'skipped', v_total - v_count);
end;
$$;

-- Jadwal bayar: upsert per No KW; hapus per No KW.
create or replace function public.m10_schedule_upsert(p_rows jsonb)
returns integer
language plpgsql volatile security definer set search_path = ''
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
  return v_count;
end;
$$;

create or replace function public.m10_schedule_delete(p_no_kw text[])
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not private.has_menu('rek.mitra10') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  delete from public.m10_payment_schedule where no_kw = any(p_no_kw);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Keterangan Kertas Kerja (mis. "LTKP", "Litigasi") untuk beberapa baris sekaligus.
create or replace function public.m10_set_keterangan(p_ids bigint[], p_text text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not private.has_menu('rek.mitra10') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  update public.m10_worksheet set keterangan = nullif(trim(p_text), '') where id = any(p_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Mapping BP → Username (tblAdd): ganti seluruh isi.
create or replace function public.m10_bp_replace(p_rows jsonb)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not private.has_menu('rek.mitra10') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  delete from public.m10_bp_users where true;
  insert into public.m10_bp_users (business_partner, payment_group, username)
  select distinct on (trim(r.business_partner)) trim(r.business_partner), nullif(trim(r.payment_group), ''), nullif(trim(r.username), '')
  from jsonb_to_recordset(p_rows) as r(business_partner text, payment_group text, username text)
  where nullif(trim(r.business_partner), '') is not null
  order by trim(r.business_partner);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.m10_set_tax_name(p_value text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.has_menu('rek.mitra10') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if nullif(trim(p_value), '') is null then
    raise exception 'Tax Name tidak boleh kosong' using errcode = '22023';
  end if;
  insert into public.app_settings (key, value, updated_by)
  values ('m10_tax_name', to_jsonb(trim(p_value)), (select auth.uid()))
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
end;
$$;

-- Dashboard Mitra10 (port sheet Dashboard). p_month kosong/di luar data → bulan invoice terakhir.
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
    'lastAging', (select max(at) from public.import_log where module = 'mitra10' and kind = 'aging')
  ) into v_res;
  return v_res;
end;
$$;

-- ── Hak eksekusi ─────────────────────────────────────────────────
revoke execute on function private.m10_append_from_aging() from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'public.mutasi_import(jsonb, text)', 'public.erp_invoice_import(jsonb, text)',
    'public.erp_payment_import(jsonb, text)', 'public.mutasi_dashboard(text)',
    'public.m10_aging_stage(uuid, jsonb)', 'public.m10_aging_commit(uuid, text)',
    'public.m10_gr_add(jsonb, text, boolean)', 'public.m10_kw_add(jsonb, text, text)',
    'public.m10_schedule_upsert(jsonb)', 'public.m10_schedule_delete(text[])',
    'public.m10_set_keterangan(bigint[], text)', 'public.m10_bp_replace(jsonb)',
    'public.m10_set_tax_name(text)', 'public.m10_dashboard(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

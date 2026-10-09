-- Fase 61: sumber kolom penjualan mingguan ✓/✗ di Email Customer.
-- TOP: erp_invoices (Invoice and Payment Date Comparison, sudah ada dari Pusat Upload).
-- CBD: upload "CBD sales" di menu Email Customer — yang disimpan HANYA tanda (BP Value + tanggal ada penjualan),
-- tanpa nominal/nomor dokumen. Tanpa DELETE: tanda yang hilang dari upload berikutnya dinonaktifkan.

create table if not exists public.email_sales_marks (
  term text not null check (term in ('CBD')),
  bp_value text not null check (char_length(btrim(bp_value)) between 1 and 120),
  sale_date date not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
create unique index if not exists email_sales_marks_uq on public.email_sales_marks (term, lower(btrim(bp_value)), sale_date);
create index if not exists email_sales_marks_date_idx on public.email_sales_marks (term, sale_date) where active;
alter table public.email_sales_marks enable row level security;
create policy "baca tanda penjualan email customer" on public.email_sales_marks for select to authenticated using (private.has_menu('bill.email'));
revoke all on public.email_sales_marks from anon, authenticated;
grant select on public.email_sales_marks to authenticated;
create trigger bump_version_email_sales_marks after insert or update on public.email_sales_marks
  for each statement execute function private.bump_version('email_customer');

-- p_rows: [{bp_value, date}] tanda unik dari file; p_from..p_to: rentang Transaction Date seluruh file.
create or replace function public.email_cbd_sales_upload(p_rows jsonb, p_from date, p_to date, p_file_name text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_in integer; v_off integer;
begin
  if not private.has_menu('bill.email') then raise exception 'Akses ditolak' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'Rentang tanggal file tidak valid' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 50000 then
    raise exception 'Data tidak valid' using errcode = '22023';
  end if;

  with inp as (
    select distinct btrim(r->>'bp_value') as bp_value, (r->>'date')::date as sale_date
    from jsonb_array_elements(p_rows) r
    where nullif(btrim(r->>'bp_value'), '') is not null and (r->>'date') ~ '^\d{4}-\d{2}-\d{2}$'
  )
  select count(*) into v_in from inp where sale_date between p_from and p_to;

  -- Tanda di rentang file yang tidak ada lagi (mis. dokumen di-reverse) → nonaktif.
  with inp as (
    select distinct btrim(r->>'bp_value') as bp_value, (r->>'date')::date as sale_date
    from jsonb_array_elements(p_rows) r
    where nullif(btrim(r->>'bp_value'), '') is not null and (r->>'date') ~ '^\d{4}-\d{2}-\d{2}$'
  )
  update public.email_sales_marks m set active = false, updated_at = now()
  where m.term = 'CBD' and m.active and m.sale_date between p_from and p_to
    and not exists (select 1 from inp i where lower(i.bp_value) = lower(btrim(m.bp_value)) and i.sale_date = m.sale_date);
  get diagnostics v_off = row_count;

  insert into public.email_sales_marks (term, bp_value, sale_date, active)
  select distinct on (lower(btrim(r->>'bp_value')), (r->>'date')::date) 'CBD', btrim(r->>'bp_value'), (r->>'date')::date, true
  from jsonb_array_elements(p_rows) r
  where nullif(btrim(r->>'bp_value'), '') is not null and (r->>'date') ~ '^\d{4}-\d{2}-\d{2}$'
    and (r->>'date')::date between p_from and p_to
  on conflict (term, lower(btrim(bp_value)), sale_date) do update set active = true, updated_at = now()
  where not public.email_sales_marks.active;

  insert into public.import_log (module, kind, file_name, rows)
  values ('email', 'cbd', left(coalesce(nullif(btrim(p_file_name), ''), 'CBD sales'), 200) || ' (' || p_from || ' s/d ' || p_to || ')', v_in);
  return jsonb_build_object('marks', v_in, 'deactivated', v_off);
end;
$$;
revoke execute on function public.email_cbd_sales_upload(jsonb, date, date, text) from public, anon;
grant execute on function public.email_cbd_sales_upload(jsonb, date, date, text) to authenticated;

-- Paket modul: + tanda penjualan CBD, tanggal invoice ERP untuk BP TOP, dan riwayat upload CBD.
create or replace function public.pack_email_customer()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_menu('bill.email') then raise exception 'Akses ditolak' using errcode = '42501'; end if;
  return jsonb_build_object(
    'groups', private.pack('select id, term, payment_group, pic_ar, keterangan, email_note, updated_at
        from public.email_groups where archived_at is null order by id',
      array['id', 'term', 'payment_group', 'pic_ar', 'keterangan', 'email_note', 'updated_at']),
    'customers', private.pack('select c.id, c.term, c.level, c.group_id, c.business_partner, c.bp_value, c.bp_key,
        c.payment_group, c.pic_ar, c.keterangan, c.email_note, c.updated_at
        from public.email_customers c where c.archived_at is null order by c.id',
      array['id', 'term', 'level', 'group_id', 'business_partner', 'bp_value', 'bp_key', 'payment_group', 'pic_ar',
            'keterangan', 'email_note', 'updated_at']),
    'emails', private.pack('select customer_id, group_id, email from public.email_addresses where active order by sort, id',
      array['customer_id', 'group_id', 'email']),
    'lookup', private.pack('with k as (select distinct bp_key from public.email_customers where bp_key is not null and archived_at is null),
        ag as (select distinct on (a.bp_key) a.bp_key, a.payment_group, a.collection_name, a.marketing, a.sales_name, a.branch, a.business_partner
               from public.v_aging_current a join k on k.bp_key = a.bp_key order by a.bp_key, a.line_no),
        er as (select distinct on (e.bp_key) e.bp_key, e.bp_group, e.marketing_group, e.branch, e.bp_name
               from public.erp_invoices e join k on k.bp_key = e.bp_key order by e.bp_key, e.invoice_date desc nulls last)
        select k.bp_key, coalesce(ag.payment_group, er.bp_group) as payment_group, ag.collection_name,
               coalesce(ag.marketing, er.marketing_group) as marketing, ag.sales_name, coalesce(ag.branch, er.branch) as branch,
               coalesce(ag.business_partner, er.bp_name) as bp_name, (ag.bp_key is not null) as in_aging
        from k left join ag on ag.bp_key = k.bp_key left join er on er.bp_key = k.bp_key order by k.bp_key',
      array['bp_key', 'payment_group', 'collection_name', 'marketing', 'sales_name', 'branch', 'bp_name', 'in_aging']),
    'cbdMarks', private.pack('select bp_value, sale_date from public.email_sales_marks
        where term = ''CBD'' and active and sale_date >= current_date - 400 order by sale_date',
      array['bp_value', 'sale_date']),
    'topSales', private.pack('select distinct e.bp_key, e.invoice_date from public.erp_invoices e
        where e.invoice_date >= current_date - 400
          and e.bp_key in (select c.bp_key from public.email_customers c where c.term = ''TOP'' and c.archived_at is null and c.bp_key is not null)
        order by e.invoice_date',
      array['bp_key', 'invoice_date']),
    'uploads', private.pack('select i.at, i.kind, i.file_name, i.rows, coalesce(p.display_name, ''-'') as uploader
        from public.import_log i left join public.profiles p on p.id = i.user_id
        where (i.module = ''email'' and i.kind = ''cbd'') or (i.module = ''data'' and i.kind = ''erp'')
        order by i.at desc limit 10',
      array['at', 'kind', 'file_name', 'rows', 'uploader']));
end;
$$;

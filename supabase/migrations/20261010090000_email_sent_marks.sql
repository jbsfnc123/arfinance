-- Fase 62: status "email sudah dikirim" per BP per minggu di Email Customer (✓ kuning → klik → ✓ hijau).
create table if not exists public.email_sent_marks (
  customer_id bigint not null references public.email_customers(id) on delete cascade,
  week_start date not null,
  sent boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  primary key (customer_id, week_start)
);
alter table public.email_sent_marks enable row level security;
create policy "baca status kirim email customer" on public.email_sent_marks for select to authenticated using (private.has_menu('bill.email'));
revoke all on public.email_sent_marks from anon, authenticated;
grant select on public.email_sent_marks to authenticated;
create trigger bump_version_email_sent_marks after insert or update on public.email_sent_marks
  for each statement execute function private.bump_version('email_customer');

create or replace function public.email_week_sent_set(p_customer bigint, p_week_start date, p_sent boolean)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.has_menu('bill.email') then raise exception 'Akses ditolak' using errcode = '42501'; end if;
  if p_week_start is null or p_sent is null then raise exception 'Data tidak valid' using errcode = '22023'; end if;
  if not exists (select 1 from public.email_customers c where c.id = p_customer and c.archived_at is null) then
    raise exception 'Business Partner tidak ditemukan' using errcode = '22023';
  end if;
  insert into public.email_sent_marks (customer_id, week_start, sent, updated_at, updated_by)
  values (p_customer, p_week_start, p_sent, now(), auth.uid())
  on conflict (customer_id, week_start) do update set sent = excluded.sent, updated_at = now(), updated_by = auth.uid();
  return p_sent;
end;
$$;
revoke execute on function public.email_week_sent_set(bigint, date, boolean) from public, anon;
grant execute on function public.email_week_sent_set(bigint, date, boolean) to authenticated;

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
      array['at', 'kind', 'file_name', 'rows', 'uploader']),
    'sent', private.pack('select s.customer_id, s.week_start, s.updated_at, coalesce(p.display_name, ''-'') as by_name
        from public.email_sent_marks s left join public.profiles p on p.id = s.updated_by
        where s.sent and s.week_start >= current_date - 400',
      array['customer_id', 'week_start', 'updated_at', 'by_name']));
end;
$$;

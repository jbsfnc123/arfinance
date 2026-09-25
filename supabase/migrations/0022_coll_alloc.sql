-- 0022: Fase 14 — grafik alokasi harian per collection (Daftar Tagihan) & laporan kuota Supabase.

-- Invoice milik collection pemanggil: target, aging terkini, atau BP yang dipegang collection itu.
create or replace function private.my_collection_invoices()
returns table (invoice_no text)
language sql stable security definer set search_path = ''
as $$
  with snap as (select id from public.ar_aging_snapshots order by month desc limit 1),
  mine as (select private.my_collection() as c)
  select t.invoice_no from public.ar_targets t, mine where t.collection_name = mine.c
  union
  select l.invoice_no from public.ar_aging_lines l, mine
  where l.snapshot_id = (select id from snap) and l.collection_name = mine.c and l.invoice_no is not null
  union
  select e.invoice_no from public.erp_invoices e
  where e.bp_key in (select l.bp_key from public.ar_aging_lines l, mine
                     where l.snapshot_id = (select id from snap) and l.collection_name = mine.c and l.bp_key is not null);
$$;
revoke execute on function private.my_collection_invoices() from public, anon, authenticated;

create or replace function public.pack_erp()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_where text;
begin
  if private.is_ctrl() or private.has_menu('rek.mutasi') or private.has_menu('lap.presentasi') or private.has_menu('rek.marketplace') then
    v_where := 'true';
  elsif private.my_kind() = 'coll' then
    -- Role collection: hanya invoice/pembayaran yang terpetakan ke collection-nya.
    v_where := 'invoice_no in (select invoice_no from private.my_collection_invoices())';
  else
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'invoices', private.pack('select invoice_no, invoice_date, amount, bp_key from public.erp_invoices where ' || v_where || ' order by invoice_date, invoice_no',
      array['invoice_no', 'invoice_date', 'amount', 'bp_key']),
    'payments', private.pack('select invoice_no, payment_date, amount from public.erp_payments where ' || v_where || ' order by payment_date, id',
      array['invoice_no', 'payment_date', 'amount']));
end;
$$;

create or replace function public.pack_targets()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_where text;
begin
  if private.is_ctrl() or private.has_menu('rek.mutasi') then
    v_where := 'true';
  elsif private.my_kind() = 'coll' then
    v_where := format('collection_name = %L', coalesce(private.my_collection(), ''));
  else
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return jsonb_build_object('targets', private.pack(
    'select month, invoice_no, target, marketing, collection_name, business_partner, due_date, branch, no_sj
     from public.ar_targets where ' || v_where || ' order by month, invoice_no',
    array['month', 'invoice_no', 'target', 'marketing', 'collection_name', 'business_partner', 'due_date', 'branch', 'no_sj']));
end;
$$;

-- Laporan pemakaian Supabase (khusus Super Admin). Egress tidak tersedia lewat SQL.
create or replace function public.usage_report()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_sa() then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'dbBytes', pg_database_size(current_database()),
    'tables', (select coalesce(jsonb_agg(t order by t.bytes desc), '[]') from (
      select c.relname as name, pg_total_relation_size(c.oid) as bytes, greatest(c.reltuples, 0)::bigint as rows
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by pg_total_relation_size(c.oid) desc limit 10) t),
    'storage', (select coalesce(jsonb_agg(s order by s.bytes desc), '[]') from (
      select b.id as bucket, count(o.id) as files, coalesce(sum((o.metadata->>'size')::bigint), 0) as bytes
      from storage.buckets b left join storage.objects o on o.bucket_id = b.id group by b.id) s),
    'users', (select count(*) from auth.users),
    'activeUsers30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'connections', (select count(*) from pg_stat_activity where datname = current_database()),
    'at', now());
end;
$$;
revoke execute on function public.usage_report() from public, anon;
grant execute on function public.usage_report() to authenticated;

-- 0048: Fase 49 — Monitor Surat Jalan: Marketing & Payment Group per SJ (filter Dashboard/Kertas Kerja, tabel Per Marketing).
-- Tambah fungsi baru (tanpa mengubah sj_aging_keys yang dipakai sj_receipts_apply & pembersihan) + pack_sj memakainya.
-- Rollback: supabase/rollback/0048_sj_marketing_pg_down.sql.

create or replace function private.sj_aging_info()
returns table (sj_key text, invoice_date date, invoice_no text, business_partner text, area text, invoices integer,
  marketing text, payment_group text)
language sql stable security definer set search_path = ''
as $$
  with snap as (select id from public.ar_aging_snapshots order by month desc limit 1),
  parts as (
    select nullif(regexp_replace(x, '^[-\s,;]+|[-\s,;]+$', '', 'g'), '') as k, l.line_no, l.invoice_date, l.invoice_no,
           l.business_partner, l.area, l.marketing, l.payment_group
    from public.ar_aging_lines l
    join snap on l.snapshot_id = snap.id
    cross join lateral regexp_split_to_table(upper(trim(l.no_sj)), '(?=SJ/)') x
    where coalesce(trim(l.no_sj), '') <> ''
  )
  select k, min(invoice_date), (array_agg(invoice_no order by line_no))[1], (array_agg(business_partner order by line_no))[1],
         (array_agg(area order by line_no))[1], count(*)::int,
         (array_agg(marketing order by line_no))[1], (array_agg(payment_group order by line_no))[1]
  from parts where k is not null group by k;
$$;
revoke execute on function private.sj_aging_info() from public, anon, authenticated;

create or replace function public.pack_sj()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_menu('tukar.monitor_sj') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'aging', private.pack('select sj_key, invoice_date, invoice_no, business_partner, area, invoices, marketing, payment_group from private.sj_aging_info()',
      array['sj_key', 'invoice_date', 'invoice_no', 'business_partner', 'area', 'invoices', 'marketing', 'payment_group']),
    'receipts', private.pack('select sj_key, sj_no, receive_date, receiver, file_name, recorded_at from public.sj_receipts',
      array['sj_key', 'sj_no', 'receive_date', 'receiver', 'file_name', 'recorded_at']),
    'receivers', private.pack('select id, name, active from public.sj_receivers order by id', array['id', 'name', 'active']),
    'log', private.pack('select l.at, l.action, l.old_name, l.new_name, coalesce(p.display_name, ''-'') as by_name
      from public.sj_receiver_log l left join public.profiles p on p.id = l.by_user order by l.at desc limit 50',
      array['at', 'action', 'old_name', 'new_name', 'by_name']),
    'uploads', private.pack('select i.at, i.file_name, i.rows, coalesce(p.display_name, ''-'') as uploader
      from public.import_log i left join public.profiles p on p.id = i.user_id where i.module = ''sj'' order by i.id desc limit 50',
      array['at', 'file_name', 'rows', 'uploader']),
    'agingAt', (select jsonb_build_object('month', month, 'at', created_at) from public.ar_aging_snapshots order by month desc limit 1),
    'canManage', private.sj_can_manage());
end;
$$;

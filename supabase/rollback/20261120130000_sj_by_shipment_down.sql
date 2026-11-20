-- Rollback Fase 85 (20261120130000_sj_by_shipment.sql): Monitor Surat Jalan kembali berbasis Aging.
-- PERHATIAN: menghapus tabel sj_docs beserta isinya. sj_receipts tidak diubah.

-- sj_receipts_apply kembali ke definisi 0045 (dengan filter Aging)
create or replace function public.sj_receipts_apply(p_file_name text, p_rows jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_total integer; v_aging integer; v_recv integer; v_date integer; v_new integer; v_file text;
begin
  if not private.sj_can_manage() then
    raise exception 'Akses ditolak: upload hanya untuk Controller/Super Admin' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 60000 then
    raise exception 'Data tidak valid (maks. 60.000 baris)' using errcode = '22023';
  end if;
  v_file := left(coalesce(nullif(trim(p_file_name), ''), 'tanpa-nama.csv'), 200);

  drop table if exists pg_temp.sj_in;
  create temp table sj_in on commit drop as
  select distinct on (k) k as sj_key, coalesce(nullif(trim(d->>'sj_no'), ''), k) as sj_no,
         private.sj_date(d->>'receive_date') as receive_date, regexp_replace(trim(coalesce(d->>'receiver', '')), '\s+', ' ', 'g') as receiver
  from jsonb_array_elements(p_rows) with ordinality e(d, ord)
  cross join lateral (select upper(trim(coalesce(d->>'sj_key', d->>'sj_no', ''))) as k) kk
  where k <> ''
  order by k, ord;
  get diagnostics v_total = row_count;

  delete from pg_temp.sj_in where sj_key not in (select a.sj_key from private.sj_aging_keys() a);
  get diagnostics v_aging = row_count;
  delete from pg_temp.sj_in i where not exists (select 1 from public.sj_receivers r where r.active and r.name_norm = lower(i.receiver));
  get diagnostics v_recv = row_count;
  delete from pg_temp.sj_in where receive_date is null;
  get diagnostics v_date = row_count;

  insert into public.sj_receipts (sj_key, sj_no, receive_date, receiver, file_name)
  select sj_key, sj_no, receive_date, receiver, v_file from pg_temp.sj_in
  on conflict (sj_key) do nothing;
  get diagnostics v_new = row_count;

  insert into public.import_log (module, kind, file_name, rows) values ('sj', 'csv', v_file, v_new);
  return jsonb_build_object('sent', v_total, 'saved', v_new, 'existing', v_total - v_aging - v_recv - v_date - v_new,
    'notInAging', v_aging, 'notRecognized', v_recv, 'badDate', v_date);
end;
$$;

-- pack_sj kembali ke definisi 0048
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

drop function if exists public.sj_report_apply(text, jsonb, jsonb);
drop function if exists private.sj_receipts_insert(jsonb, text);
drop table if exists public.sj_docs;

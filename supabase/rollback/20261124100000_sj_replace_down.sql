-- Rollback Fase 87 (20261124100000_sj_replace.sql). Data SJ yang sudah dihapus TIDAK kembali (upload ulang).

-- pack_sj kembali ke definisi Fase 86
create or replace function public.pack_sj()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_menu('tukar.monitor_sj') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'docs', private.pack('select sj_key, sj_no, tanggal_sj, area, business_partner, locator, send_date from public.sj_docs',
      array['sj_key', 'sj_no', 'tanggal_sj', 'area', 'business_partner', 'locator', 'send_date']),
    'receipts', private.pack('select sj_key, sj_no, receive_date, receiver, file_name, recorded_at from public.sj_receipts',
      array['sj_key', 'sj_no', 'receive_date', 'receiver', 'file_name', 'recorded_at']),
    'receivers', private.pack('select id, name, active from public.sj_receivers order by id', array['id', 'name', 'active']),
    'hidden', private.pack('select kind, value from public.sj_visibility where hidden', array['kind', 'value']),
    'log', private.pack('select l.at, l.action, l.old_name, l.new_name, coalesce(p.display_name, ''-'') as by_name
      from public.sj_receiver_log l left join public.profiles p on p.id = l.by_user order by l.at desc limit 50',
      array['at', 'action', 'old_name', 'new_name', 'by_name']),
    'uploads', private.pack('select i.at, i.file_name, i.rows, coalesce(p.display_name, ''-'') as uploader
      from public.import_log i left join public.profiles p on p.id = i.user_id where i.module = ''sj'' order by i.id desc limit 50',
      array['at', 'file_name', 'rows', 'uploader']),
    'docsAt', (select jsonb_build_object('file', file_name, 'at', at) from public.import_log where module = 'sj' order by id desc limit 1),
    'canManage', private.sj_can_manage());
end;
$$;

drop function if exists public.sj_report_replace(text, integer, integer, jsonb, jsonb);
alter table public.sj_docs drop column if exists marketing_group;

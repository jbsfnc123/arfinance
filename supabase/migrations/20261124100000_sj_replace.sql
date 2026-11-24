-- Fase 87 — Surat Jalan: data yang dipakai & ditampilkan HANYA dari update terakhir (ganti total), + Marketing Group.
-- * sj_report_replace: potongan 1 mengosongkan sj_docs & sj_receipts lalu mengisi; potongan berikutnya menambah.
--   Tidak ada pembacaan/penggabungan data lama. Receiver aktif & tanggal valid disaring di server (AR Bot tidak membaca
--   apa pun dari Workspace). import_log dicatat sekali (potongan terakhir).
-- * sj_docs.marketing_group: diisi AR Bot / upload manual dari Invoice by Date (BP Name = Business Partner, digabung lokal).
-- * Data SJ yang ada sekarang DIHAPUS (permintaan user): Monitor kosong sampai update berikutnya. Pengaturan centang
--   BP/Area (sj_visibility) & daftar Receiver tidak disentuh. Daftar Tagihan (Receive Date SJ) ikut data terbaru.
-- Rollback: supabase/rollback/20261124100000_sj_replace_down.sql (data yang terhapus tidak kembali).

alter table public.sj_docs add column if not exists marketing_group text;

create or replace function public.sj_report_replace(p_file_name text, p_part integer, p_parts integer, p_docs jsonb, p_receipts jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_file text; v_docs integer; v_total integer; v_recv integer; v_date integer; v_new integer; v_all integer;
begin
  if not private.sj_can_manage() then
    raise exception 'Akses ditolak: upload hanya untuk Controller/Super Admin' using errcode = '42501';
  end if;
  if p_part is null or p_parts is null or p_part < 1 or p_part > p_parts then
    raise exception 'Nomor potongan tidak valid' using errcode = '22023';
  end if;
  if jsonb_typeof(p_docs) <> 'array' or jsonb_typeof(p_receipts) <> 'array'
     or jsonb_array_length(p_docs) > 60000 or jsonb_array_length(p_receipts) > 60000 then
    raise exception 'Data tidak valid (maks. 60.000 baris per potongan)' using errcode = '22023';
  end if;
  v_file := left(coalesce(nullif(trim(p_file_name), ''), 'tanpa-nama.csv'), 200);

  -- Ganti total: data lama dihapus seluruhnya pada potongan pertama.
  if p_part = 1 then
    delete from public.sj_receipts where true;
    delete from public.sj_docs where true;
  end if;

  with d as (
    select distinct on (k) k as sj_key, coalesce(nullif(trim(x->>'sj_no'), ''), k) as sj_no,
           private.sj_date(x->>'tanggal_sj') as tanggal_sj, nullif(trim(x->>'area'), '') as area,
           nullif(trim(x->>'business_partner'), '') as business_partner, nullif(trim(x->>'locator'), '') as locator,
           private.sj_date(x->>'send_date') as send_date, nullif(trim(x->>'marketing_group'), '') as marketing_group
    from jsonb_array_elements(p_docs) with ordinality e(x, ord)
    cross join lateral (select upper(trim(coalesce(x->>'sj_key', x->>'sj_no', ''))) as k) kk
    where k <> ''
    order by k, ord
  ), ins as (
    insert into public.sj_docs (sj_key, sj_no, tanggal_sj, area, business_partner, locator, send_date, marketing_group, file_name)
    select sj_key, sj_no, tanggal_sj, area, business_partner, locator, send_date, marketing_group, v_file from d
    on conflict (sj_key) do nothing
    returning 1
  )
  select count(*) into v_docs from ins;

  -- Penerimaan: per SJ baris pertama (urutan file) dengan Receiver aktif & Receive Date valid; potongan lebih awal menang.
  with r as (
    select k as sj_key, coalesce(nullif(trim(x->>'sj_no'), ''), k) as sj_no, ord,
           private.sj_date(x->>'receive_date') as receive_date,
           regexp_replace(trim(coalesce(x->>'receiver', '')), '\s+', ' ', 'g') as receiver
    from jsonb_array_elements(p_receipts) with ordinality e(x, ord)
    cross join lateral (select upper(trim(coalesce(x->>'sj_key', x->>'sj_no', ''))) as k) kk
    where k <> ''
  ), c as (
    select r.*, exists (select 1 from public.sj_receivers v where v.active and v.name_norm = lower(r.receiver)) as ok from r
  ), pick as (
    select distinct on (sj_key) sj_key, sj_no, receive_date, receiver from c
    where ok and receive_date is not null order by sj_key, ord
  ), ins as (
    insert into public.sj_receipts (sj_key, sj_no, receive_date, receiver, file_name)
    select sj_key, sj_no, receive_date, receiver, v_file from pick
    on conflict (sj_key) do nothing
    returning 1
  )
  select (select count(*) from c), (select count(*) from c where not ok),
         (select count(*) from c where ok and receive_date is null), (select count(*) from ins)
  into v_total, v_recv, v_date, v_new;

  if p_part = p_parts then
    select count(*) into v_all from public.sj_docs;
    insert into public.import_log (module, kind, file_name, rows) values ('sj', 'csv', regexp_replace(v_file, '\s*\(\d+/\d+\)$', ''), v_all);
  end if;
  return jsonb_build_object('docs', v_docs, 'sent', v_total, 'saved', v_new, 'notRecognized', v_recv, 'badDate', v_date);
end;
$$;
revoke execute on function public.sj_report_replace(text, integer, integer, jsonb, jsonb) from public, anon;
grant execute on function public.sj_report_replace(text, integer, integer, jsonb, jsonb) to authenticated;

create or replace function public.pack_sj()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_menu('tukar.monitor_sj') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'docs', private.pack('select sj_key, sj_no, tanggal_sj, area, business_partner, locator, send_date, marketing_group from public.sj_docs',
      array['sj_key', 'sj_no', 'tanggal_sj', 'area', 'business_partner', 'locator', 'send_date', 'marketing_group']),
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

-- ══ BERSIHKAN DATA SURAT JALAN SEKARANG (permintaan user) ═════════
delete from public.sj_receipts where true;
delete from public.sj_docs where true;

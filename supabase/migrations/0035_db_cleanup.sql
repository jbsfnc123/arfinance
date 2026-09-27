-- 0035: Fase 29b — penghapusan hasil audit database (disetujui user 2026-09-27).
-- 1) Snapshot aging palsu dari file Target (snapshot "2026-08" = "Target September 2026.xlsx", duplikat ar_targets).
-- 2) Retensi snapshot aging di aging_commit: simpan terbaru + 1 sebelumnya (+ snapshot yang baru di-upload).
-- 3) Master Business Partner dihapus (0 baris, tidak ada konsumen sejak Presentasi AR berdiri sendiri).
-- 4) Objek mati: pin_login (login lama; kini pin_login_named), m10_set_keterangan (sebelum Keterangan bersama),
--    view v_target_months.
-- 5) Index staging upload_rows dibangun ulang (bloat 2,8 MB untuk 0 baris).
-- (Duplikat erp_payments sudah hilang lewat upload ERP terbaru; erp_commit mencegahnya sejak 0033.)

-- 1) Snapshot palsu (baris aging ikut terhapus: ON DELETE CASCADE).
delete from public.ar_aging_snapshots s
where s.file_name ilike '%target%'
  and s.id <> (select id from public.ar_aging_snapshots order by month desc limit 1);

-- 2) Retensi snapshot di aging_commit (penggantian teks yang dicek).
do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef('public.aging_commit(uuid)'::regprocedure) into v_def;
  v_new := replace(v_def,
    '  insert into public.import_log (module, kind, file_name, months, rows, user_id, file_sha256)
  values (''data'', ''aging''',
    '  -- Retensi: simpan snapshot terbaru + 1 sebelumnya (dan snapshot yang baru saja di-upload).
  delete from public.ar_aging_snapshots
  where id <> v_snap and id not in (select id from public.ar_aging_snapshots order by month desc limit 2);

  insert into public.import_log (module, kind, file_name, months, rows, user_id, file_sha256)
  values (''data'', ''aging''');
  if v_new = v_def then
    raise exception 'aging_commit: pernyataan import_log tidak ditemukan';
  end if;
  execute v_new;
end $$;

-- 3) Master Business Partner.
drop function if exists public.bp_commit(uuid);
drop table if exists public.business_partners;
create or replace function private.can_upload(p_kind text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case p_kind
    when 'aging' then private.has_menu('set.update') or private.has_menu('rek.mitra10') or private.has_menu('lap.presentasi')
    when 'erp'   then private.has_menu('rek.mutasi') or private.has_menu('lap.presentasi') or private.has_menu('rek.marketplace')
    else false end;
$$;

-- 4) Objek mati.
drop function if exists public.pin_login(text, text);
drop function if exists public.m10_set_keterangan(bigint[], text);
drop view if exists public.v_target_months;

-- 5) Staging upload.
reindex table private.upload_rows;

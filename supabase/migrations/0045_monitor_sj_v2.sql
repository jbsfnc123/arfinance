-- 0045: Fase 46 — Monitor Surat Jalan model baru (keputusan user 2026-10-01).
-- * Hanya SJ yang ada di No SJ Aging terbaru yang disimpan (relasi dengan aging; No SJ gabungan "SJ/a-SJ/b" dipecah).
-- * Per SJ hanya disimpan Receive Date & Receiver; upload berikutnya hanya mengisi SJ yang Receive Date-nya belum ada.
-- * Filter Receiver yang diakui tetap (sj_receivers + sj_receiver_save + sj_can_manage dari 0042 dipertahankan).
-- * SJ yang keluar dari aging terbaru → data penerimaannya ikut dihapus (trigger setelah aging di-insert).
-- * Tanggal awal durasi = Invoice Date aging (dihitung di browser).
-- DESTRUKTIF atas permintaan user: struktur & data model lama (sj_events, sj_batches, staging, RPC upload) dihapus.
-- Rollback: supabase/rollback/0045_monitor_sj_v2_down.sql.

-- ══ HAPUS MODEL LAMA (beserta datanya) ═════════════════════════════
drop function if exists public.pack_sj();
drop function if exists public.sj_events_of(text);
drop function if exists public.sj_upload_commit(bigint);
drop function if exists public.sj_upload_rows(bigint, integer, jsonb);
drop function if exists public.sj_upload_begin(text, text, integer, integer);
drop table if exists public.sj_events;
drop table if exists private.sj_stage;
drop table if exists public.sj_batches;
drop sequence if exists public.sj_publish_seq;
delete from public.import_log where module = 'sj';

-- Tanggal ISO → date tanpa EXCEPTION (dipakai ulang; definisi sama dengan 0044).
create or replace function private.sj_date(p text)
returns date
language sql immutable set search_path = ''
as $$
  select case when p ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$'
    and substr(p, 9, 2)::int <= extract(day from (substr(p, 1, 7) || '-01')::date + interval '1 month' - interval '1 day')
    then p::date end;
$$;
revoke execute on function private.sj_date(text) from public, anon, authenticated;

-- ══ KUNCI SJ DARI AGING TERBARU ════════════════════════════════════
-- Snapshot terbaru = order by month desc (sama dengan pack_aging / rkm_append_from_aging).
-- No SJ dipecah sebelum setiap "SJ/" (sama dengan splitSj di lib/modules/collection/revision.ts).
create or replace function private.sj_aging_keys()
returns table (sj_key text, invoice_date date, invoice_no text, business_partner text, area text, invoices integer)
language sql stable security definer set search_path = ''
as $$
  with snap as (select id from public.ar_aging_snapshots order by month desc limit 1),
  parts as (
    select nullif(regexp_replace(x, '^[-\s,;]+|[-\s,;]+$', '', 'g'), '') as k, l.line_no, l.invoice_date, l.invoice_no,
           l.business_partner, l.area
    from public.ar_aging_lines l
    join snap on l.snapshot_id = snap.id
    cross join lateral regexp_split_to_table(upper(trim(l.no_sj)), '(?=SJ/)') x
    where coalesce(trim(l.no_sj), '') <> ''
  )
  select k, min(invoice_date), (array_agg(invoice_no order by line_no))[1], (array_agg(business_partner order by line_no))[1],
         (array_agg(area order by line_no))[1], count(*)::int
  from parts where k is not null group by k;
$$;
revoke execute on function private.sj_aging_keys() from public, anon, authenticated;

-- ══ PENERIMAAN PER SJ ══════════════════════════════════════════════
create table public.sj_receipts (
  sj_key       text primary key,             -- upper(trim(No SJ)); harus ada di aging terbaru
  sj_no        text not null,                -- No SJ seperti di file
  receive_date date not null,
  receiver     text not null,                -- nama asli dari file (Receiver yang diakui saat upload)
  file_name    text,
  recorded_at  timestamptz not null default now(),
  recorded_by  uuid default auth.uid()
);
comment on table public.sj_receipts is 'Monitor Surat Jalan: Receive Date & Receiver pertama yang diakui per SJ aging. Tidak ditimpa upload berikutnya; dihapus bila SJ keluar dari aging terbaru.';
alter table public.sj_receipts enable row level security;
create policy "baca penerimaan surat jalan" on public.sj_receipts for select to authenticated using (private.has_menu('tukar.monitor_sj'));
revoke all on public.sj_receipts from anon, authenticated;
grant select on public.sj_receipts to authenticated;
create trigger bump_version_sj_receipts after insert or update or delete or truncate on public.sj_receipts
  for each statement execute function private.bump_version('sj');

-- Hapus penerimaan SJ yang tidak ada lagi di aging terbaru.
create or replace function private.sj_prune()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_n integer;
begin
  -- not in (subquery) dihitung sekali (hashed); sj_aging_keys tidak pernah mengembalikan kunci null.
  delete from public.sj_receipts where sj_key not in (select a.sj_key from private.sj_aging_keys() a);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function private.sj_prune() from public, anon, authenticated;

-- Setelah aging baru di-insert (satu statement di aging_commit). Hanya INSERT: penghapusan snapshot bulan yang sama
-- terjadi SEBELUM insert ulang, jadi memangkas saat DELETE akan memakai aging yang belum lengkap.
create or replace function private.sj_after_aging()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.sj_prune();
  return null;
end;
$$;
revoke execute on function private.sj_after_aging() from public, anon, authenticated;
create trigger sj_after_aging after insert on public.ar_aging_lines
  for each statement execute function private.sj_after_aging();

-- ══ RPC ════════════════════════════════════════════════════════════
-- Simpan kandidat penerimaan (dipilih di browser: per SJ baris pertama dengan Receiver diakui & Receive Date valid).
-- Server menyaring ulang: SJ harus di aging terbaru, Receiver aktif di daftar, tanggal valid. SJ yang sudah punya
-- Receive Date tidak ditimpa. Atomik (satu transaksi).
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

-- Paket data untuk browser: daftar SJ aging terbaru, penerimaan, Receiver, jejak perubahan, riwayat upload.
create or replace function public.pack_sj()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_menu('tukar.monitor_sj') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'aging', private.pack('select sj_key, invoice_date, invoice_no, business_partner, area, invoices from private.sj_aging_keys()',
      array['sj_key', 'invoice_date', 'invoice_no', 'business_partner', 'area', 'invoices']),
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

revoke execute on function public.pack_sj() from public, anon;
revoke execute on function public.sj_receipts_apply(text, jsonb) from public, anon;
grant execute on function public.pack_sj() to authenticated;
grant execute on function public.sj_receipts_apply(text, jsonb) to authenticated;

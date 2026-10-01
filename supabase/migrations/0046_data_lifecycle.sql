-- 0046: Fase 47 — siklus hidup data, kontak multi-orang, dan pembersihan database oleh Super Admin.
-- Keputusan user 2026-10-01:
-- * Keterangan (invoice_remarks), Tukar Faktur & Ekspedisi (invoice_exchanges) dan laporan harian kolektor
--   (courier_updates) TIDAK permanen: dihapus bila invoice/SJ-nya tidak ada lagi di Aging terbaru (= lunas).
--   Otomatis setiap Aging baru di-insert, dengan PENGAMAN: bila satu upload akan menghapus > 30% data (dan > 20 baris)
--   penghapusan ditahan dan menunggu konfirmasi Super Admin di halaman Pembersihan (melindungi dari file aging keliru).
-- * Kontak: beberapa orang/nomor per Business Partner + Kode BP (data master, permanen).
-- * Halaman Pembersihan (Finance › Database, khusus Super Admin): pilih kategori → pratinjau → centang → hapus; semua
--   penghapusan dicatat di cleanup_log.
-- Tidak mengubah faktur, worksheet Mitra10/RKM, maupun aging. Rollback: supabase/rollback/0046_data_lifecycle_down.sql.

-- ══ KONTAK: banyak per BP ══════════════════════════════════════════
alter table public.contacts drop constraint contacts_pkey;
alter table public.contacts add column id bigint generated always as identity primary key;
alter table public.contacts add column kode_bp text;
create unique index contacts_bp_wa_uniq on public.contacts (lower(trim(business_partner)), (regexp_replace(no_wa, '\D', '', 'g')));
create index contacts_bp_idx on public.contacts (lower(trim(business_partner)));

-- Simpan kontak: baris dengan id → ubah; tanpa id → tambah (nomor yang sama untuk BP yang sama = ubah nama/kode).
create or replace function public.contacts_save(p_rows jsonb)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_n integer := 0; v_one integer; r jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Akses ditolak' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'Data kontak tidak valid' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(trim(r->>'business_partner'), '') = '' or coalesce(trim(r->>'no_wa'), '') = '' then continue; end if;
    if r ? 'id' and nullif(r->>'id', '') is not null then
      update public.contacts set business_partner = trim(r->>'business_partner'), nama = nullif(trim(r->>'nama'), ''),
        no_wa = trim(r->>'no_wa'), kode_bp = coalesce(nullif(trim(r->>'kode_bp'), ''), kode_bp),
        updated_at = now(), updated_by = auth.uid()
      where id = (r->>'id')::bigint;
    else
      insert into public.contacts (business_partner, nama, no_wa, kode_bp, updated_at, updated_by)
      values (trim(r->>'business_partner'), nullif(trim(r->>'nama'), ''), trim(r->>'no_wa'), nullif(trim(r->>'kode_bp'), ''), now(), auth.uid())
      on conflict (lower(trim(business_partner)), (regexp_replace(no_wa, '\D', '', 'g')))
      do update set nama = coalesce(excluded.nama, public.contacts.nama), kode_bp = coalesce(excluded.kode_bp, public.contacts.kode_bp),
        updated_at = now(), updated_by = auth.uid();
    end if;
    get diagnostics v_one = row_count;
    v_n := v_n + v_one;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.contacts_save(jsonb) from public, anon;
grant execute on function public.contacts_save(jsonb) to authenticated;

-- Keterangan hasil impor database lama.
alter table public.invoice_remarks drop constraint invoice_remarks_source_check;
alter table public.invoice_remarks add constraint invoice_remarks_source_check
  check (source = any (array['collection', 'mitra10', 'rkm', 'hold', 'pengajuan', 'catatan', 'import']));

-- ══ KUNCI AGING TERBARU ════════════════════════════════════════════
create or replace function private.aging_latest_id()
returns bigint language sql stable security definer set search_path = ''
as $$ select id from public.ar_aging_snapshots order by month desc limit 1 $$;

create or replace function private.aging_invoice_keys()
returns table (invoice_key text) language sql stable security definer set search_path = ''
as $$
  select distinct upper(trim(l.invoice_no)) from public.ar_aging_lines l
  where l.snapshot_id = private.aging_latest_id() and coalesce(trim(l.invoice_no), '') <> '';
$$;

-- Ref keterangan yang masih hidup = remark_ref(No SJ, Invoice) baris aging terbaru (sama dengan yang dipakai klien).
create or replace function private.aging_remark_refs()
returns table (ref text) language sql stable security definer set search_path = ''
as $$
  select distinct private.remark_ref(l.no_sj, l.invoice_no) from public.ar_aging_lines l
  where l.snapshot_id = private.aging_latest_id() and private.remark_ref(l.no_sj, l.invoice_no) is not null;
$$;
revoke execute on function private.aging_latest_id(), private.aging_invoice_keys(), private.aging_remark_refs() from public, anon, authenticated;

-- ══ LOG & STATUS PEMBERSIHAN ═══════════════════════════════════════
create table public.cleanup_log (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  by_user   uuid default auth.uid(),
  mode      text not null check (mode in ('otomatis', 'manual', 'konfirmasi')),
  category  text not null,
  rows      integer not null,
  detail    jsonb
);
alter table public.cleanup_log enable row level security;
revoke all on public.cleanup_log from anon, authenticated;
create index cleanup_log_at_idx on public.cleanup_log (at desc);

-- Penghapusan otomatis yang ditahan pengaman (satu baris).
create table private.cleanup_hold (
  id      integer primary key default 1 check (id = 1),
  at      timestamptz not null default now(),
  counts  jsonb not null
);
revoke all on private.cleanup_hold from anon, authenticated;

-- ══ PEMANGKASAN DATA TIDAK PERMANEN ════════════════════════════════
-- p_force=false: pengaman aktif (otomatis). p_force=true: konfirmasi Super Admin.
create or replace function private.prune_ephemeral(p_force boolean, p_mode text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare r_del int; e_del int; c_del int; r_tot int; e_tot int; c_tot int; v_del int; v_tot int; v_counts jsonb;
begin
  -- Tanpa aging (atau aging kosong) tidak ada acuan → jangan hapus apa pun.
  if not exists (select 1 from public.ar_aging_lines where snapshot_id = private.aging_latest_id()) then
    return jsonb_build_object('skipped', 'aging kosong');
  end if;
  drop table if exists pg_temp._inv; drop table if exists pg_temp._ref;
  create temp table _inv on commit drop as select invoice_key from private.aging_invoice_keys();
  create temp table _ref on commit drop as select ref from private.aging_remark_refs();
  select count(*), count(*) filter (where ref not in (select ref from pg_temp._ref)) into r_tot, r_del from public.invoice_remarks;
  select count(*), count(*) filter (where upper(trim(invoice_no)) not in (select invoice_key from pg_temp._inv)) into e_tot, e_del from public.invoice_exchanges;
  select count(*), count(*) filter (where upper(trim(invoice_no)) not in (select invoice_key from pg_temp._inv)) into c_tot, c_del from public.courier_updates;
  v_del := r_del + e_del + c_del; v_tot := r_tot + e_tot + c_tot;
  v_counts := jsonb_build_object('keterangan', r_del, 'tukar_ekspedisi', e_del, 'laporan_kolektor', c_del, 'total', v_tot);
  if v_del = 0 then
    delete from private.cleanup_hold;
    drop table if exists pg_temp._inv; drop table if exists pg_temp._ref;
    return v_counts || jsonb_build_object('deleted', 0);
  end if;
  if not p_force and v_del > 20 and v_del > 0.3 * v_tot then
    insert into private.cleanup_hold (id, at, counts) values (1, now(), v_counts)
    on conflict (id) do update set at = excluded.at, counts = excluded.counts;
    drop table if exists pg_temp._inv; drop table if exists pg_temp._ref;
    return v_counts || jsonb_build_object('held', true);
  end if;
  delete from public.invoice_remarks where ref not in (select ref from pg_temp._ref);
  delete from public.invoice_exchanges where upper(trim(invoice_no)) not in (select invoice_key from pg_temp._inv);
  delete from public.courier_updates where upper(trim(invoice_no)) not in (select invoice_key from pg_temp._inv);
  delete from private.cleanup_hold;
  insert into public.cleanup_log (mode, category, rows, detail) values (p_mode, 'tidak_permanen', v_del, v_counts);
  drop table if exists pg_temp._inv; drop table if exists pg_temp._ref;
  return v_counts || jsonb_build_object('deleted', v_del);
end;
$$;
revoke execute on function private.prune_ephemeral(boolean, text) from public, anon, authenticated;

create or replace function private.ephemeral_after_aging()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.prune_ephemeral(false, 'otomatis');
  return null;
end;
$$;
revoke execute on function private.ephemeral_after_aging() from public, anon, authenticated;
-- Hanya AFTER INSERT: aging_commit menghapus snapshot bulan yang sama dulu, lalu insert ulang (lihat sj_after_aging).
create trigger ephemeral_after_aging after insert on public.ar_aging_lines
  for each statement execute function private.ephemeral_after_aging();

-- ══ PEMBERSIHAN MANUAL (SUPER ADMIN) ═══════════════════════════════
-- Kandidat per kategori: key (dipakai untuk menghapus), label, info, tanggal. p_cutoff untuk kategori berbasis umur.
create or replace function private.cleanup_candidates(p_category text, p_cutoff date)
returns table (key text, label text, info text, at date)
language plpgsql stable security definer set search_path = ''
as $$
begin
  case p_category
  when 'keterangan' then return query
    select r.ref, coalesce(r.no_sj, r.invoice_no, r.ref), r.keterangan, r.updated_at::date from public.invoice_remarks r
    where r.ref not in (select a.ref from private.aging_remark_refs() a);
  when 'tukar_ekspedisi' then return query
    select e.id::text, e.invoice_no, e.metode || coalesce(' · resi ' || e.resi, '') || coalesce(' · ' || e.kurir, ''), e.tanggal
    from public.invoice_exchanges e where upper(trim(e.invoice_no)) not in (select k.invoice_key from private.aging_invoice_keys() k);
  when 'laporan_kolektor' then return query
    select u.id::text, u.invoice_no, u.status || ' · ' || u.kurir || coalesce(' · ' || u.kode, ''), u.tanggal_tukar
    from public.courier_updates u where upper(trim(u.invoice_no)) not in (select k.invoice_key from private.aging_invoice_keys() k);
  when 'jadwal_kolektor' then return query
    select s.invoice_no, s.invoice_no, coalesce(s.business_partner, ''), s.send_date
    from public.courier_schedules s where upper(trim(s.invoice_no)) not in (select k.invoice_key from private.aging_invoice_keys() k);
  when 'catatan' then return query
    select n.id::text, n.invoice_no, n.kategori || ': ' || n.isi, n.created_at::date
    from public.notes n where upper(trim(n.invoice_no)) not in (select k.invoice_key from private.aging_invoice_keys() k);
  when 'janji_bayar' then return query
    select p.id::text, p.invoice_no, coalesce(p.isi, ''), p.promise_date
    from public.payment_promises p where upper(trim(p.invoice_no)) not in (select k.invoice_key from private.aging_invoice_keys() k);
  when 'hold_faktur' then return query
    select h.id::text, h.invoice_no, h.bp_value, h.created_at::date
    from public.tax_invoice_holds h where upper(trim(h.invoice_no)) not in (select k.invoice_key from private.aging_invoice_keys() k);
  when 'staging_upload' then return query
    select b.id::text, coalesce(b.file_name, b.kind), b.kind || ' · ' || (select count(*) from private.upload_rows u where u.batch = b.id) || ' baris', b.created_at::date
    from private.upload_batches b where b.created_at < now() - interval '1 day';
  when 'riwayat_upload' then return query
    select i.id::text, coalesce(i.file_name, i.kind), i.module || ' · ' || i.kind || ' · ' || coalesce(i.rows, 0) || ' baris', i.at::date
    from public.import_log i where i.at::date < p_cutoff;
  when 'log_login' then return query
    select 'L' || l.id, coalesce(l.ip, '-'), case when l.success then 'login berhasil' else 'login gagal' end, l.at::date
    from private.login_attempts l where l.at::date < p_cutoff
    union all
    select 'N' || n.id, coalesce(n.ip, '-'), 'cek nama', n.at::date from private.name_lookups n where n.at::date < p_cutoff;
  when 'erp_pembayaran' then return query
    select p.id::text, p.invoice_no, coalesce(p.payment_doc, '') || ' · ' || p.amount::text, p.payment_date
    from public.erp_payments p where p.payment_date < p_cutoff;
  when 'erp_invoice' then return query
    select i.invoice_no, i.invoice_no, coalesce(i.bp_name, '') || ' · ' || i.amount::text, i.invoice_date
    from public.erp_invoices i where i.invoice_date < p_cutoff
      and upper(trim(i.invoice_no)) not in (select k.invoice_key from private.aging_invoice_keys() k)
      and not exists (select 1 from public.erp_payments p where p.invoice_no = i.invoice_no and p.payment_date >= p_cutoff);
  when 'mutasi_bank' then return query
    select m.id::text, m.account, coalesce(m.keterangan, '') || ' · ' || m.amount::text, m.tx_date
    from public.bank_mutations m where m.tx_date < p_cutoff;
  else raise exception 'Kategori tidak dikenal: %', p_category using errcode = '22023';
  end case;
end;
$$;
revoke execute on function private.cleanup_candidates(text, date) from public, anon, authenticated;

-- Ringkasan semua kategori (jumlah kandidat) + status pengaman.
create or replace function public.cleanup_overview(p_cutoff date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v jsonb := '[]'::jsonb; c text; n bigint;
begin
  if not private.is_sa() then raise exception 'Akses ditolak: khusus Super Admin' using errcode = '42501'; end if;
  foreach c in array array['keterangan', 'tukar_ekspedisi', 'laporan_kolektor', 'jadwal_kolektor', 'catatan', 'janji_bayar',
    'hold_faktur', 'staging_upload', 'riwayat_upload', 'log_login', 'erp_pembayaran', 'erp_invoice', 'mutasi_bank'] loop
    select count(*) into n from private.cleanup_candidates(c, p_cutoff);
    v := v || jsonb_build_object('category', c, 'count', n);
  end loop;
  return jsonb_build_object('categories', v,
    'hold', (select jsonb_build_object('at', at, 'counts', counts) from private.cleanup_hold),
    'agingAt', (select jsonb_build_object('month', month, 'at', created_at) from public.ar_aging_snapshots order by month desc limit 1),
    'log', coalesce((select jsonb_agg(x order by x.at desc) from (
      select l.at, l.mode, l.category, l.rows, l.detail, coalesce(p.display_name, '-') as by_name
      from public.cleanup_log l left join public.profiles p on p.id = l.by_user order by l.at desc limit 50) x), '[]'::jsonb));
end;
$$;

create or replace function public.cleanup_preview(p_category text, p_cutoff date)
returns table (key text, label text, info text, at date)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_sa() then raise exception 'Akses ditolak: khusus Super Admin' using errcode = '42501'; end if;
  return query select c.key, c.label, c.info, c.at from private.cleanup_candidates(p_category, p_cutoff) c order by c.at nulls first, c.label limit 50000;
end;
$$;

-- Hapus baris TERPILIH yang masih memenuhi syarat kategori (tidak bisa menghapus data yang tidak relevan).
create or replace function public.cleanup_delete(p_category text, p_keys text[], p_cutoff date)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_keys text[]; v_n integer := 0; v_m integer;
begin
  if not private.is_sa() then raise exception 'Akses ditolak: khusus Super Admin' using errcode = '42501'; end if;
  if coalesce(cardinality(p_keys), 0) = 0 then return 0; end if;
  if cardinality(p_keys) > 50000 then raise exception 'Maks. 50.000 baris per penghapusan' using errcode = '22023'; end if;
  select array_agg(c.key) into v_keys from private.cleanup_candidates(p_category, p_cutoff) c where c.key = any (p_keys);
  if v_keys is null then return 0; end if;
  case p_category
  when 'keterangan' then delete from public.invoice_remarks where ref = any (v_keys);
  when 'tukar_ekspedisi' then delete from public.invoice_exchanges where id::text = any (v_keys);
  when 'laporan_kolektor' then delete from public.courier_updates where id::text = any (v_keys);
  when 'jadwal_kolektor' then delete from public.courier_schedules where invoice_no = any (v_keys);
  when 'catatan' then delete from public.notes where id::text = any (v_keys);
  when 'janji_bayar' then delete from public.payment_promises where id::text = any (v_keys);
  when 'hold_faktur' then delete from public.tax_invoice_holds where id::text = any (v_keys);
  when 'staging_upload' then delete from private.upload_batches where id::text = any (v_keys);
  when 'riwayat_upload' then delete from public.import_log where id::text = any (v_keys);
  when 'log_login' then
    delete from private.login_attempts where 'L' || id = any (v_keys);
    get diagnostics v_m = row_count; v_n := v_m;
    delete from private.name_lookups where 'N' || id = any (v_keys);
  when 'erp_pembayaran' then delete from public.erp_payments where id::text = any (v_keys);
  when 'erp_invoice' then delete from public.erp_invoices where invoice_no = any (v_keys);
  when 'mutasi_bank' then delete from public.bank_mutations where id::text = any (v_keys);
  end case;
  get diagnostics v_m = row_count;
  v_n := v_n + v_m;
  insert into public.cleanup_log (mode, category, rows, detail)
  values ('manual', p_category, v_n, jsonb_build_object('cutoff', p_cutoff, 'contoh', (select jsonb_agg(k) from (select unnest(v_keys[1:5]) k) x)));
  return v_n;
end;
$$;

-- Jalankan penghapusan otomatis yang ditahan pengaman (konfirmasi Super Admin).
create or replace function public.cleanup_run_pending()
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.is_sa() then raise exception 'Akses ditolak: khusus Super Admin' using errcode = '42501'; end if;
  return private.prune_ephemeral(true, 'konfirmasi');
end;
$$;

revoke execute on function public.cleanup_overview(date), public.cleanup_preview(text, date), public.cleanup_delete(text, text[], date),
  public.cleanup_run_pending() from public, anon;
grant execute on function public.cleanup_overview(date), public.cleanup_preview(text, date), public.cleanup_delete(text, text[], date),
  public.cleanup_run_pending() to authenticated;

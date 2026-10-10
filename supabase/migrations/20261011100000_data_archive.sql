-- Fase 66 — Arsip data ke Google Drive. Supabase hanya memegang data operasional; data historis diekspor (route handler
-- Next.js → GAS "AR Archive" → Drive), diverifikasi, dicatat di archive_index, baru dihapus lewat archive_purge.
--
-- Retensi "minimal yang aman" (lihat docs/arsip-data.md):
--   erp_payments   : bulan berjalan + bulan Collection yang masih terbuka tetap; bulan lain → arsip
--   erp_invoices   : tetap bila masih di Aging terbaru, punya pembayaran yang masih di DB, atau bulannya disimpan
--   aging_snapshot : snapshot terbaru + snapshot yang terikat periode Collection terbuka tetap
--   ar_targets     : bulan Collection yang sudah Closed → arsip (data beku tetap di collection_closings)
--   bank_mutations : sama dengan erp_payments
-- Migrasi ini berisi DELETE (di dalam fungsi) → dijalankan lewat SQL Editor.

-- ── Indeks arsip ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.archive_index (
  id bigserial primary key,
  dataset text not null,
  period text not null,
  label text,
  file_id text not null,
  file_name text not null,
  rows integer not null,                 -- baris di file (termasuk arsip lama yang digabung)
  db_rows integer not null,              -- baris yang diambil dari Supabase pada arsip ini (yang akan dihapus)
  db_amount numeric not null default 0,  -- total nominal baris itu (verifikasi sebelum hapus)
  bytes integer not null,
  sha256 text not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  purged_at timestamptz,
  purged_rows integer,
  superseded_by bigint references public.archive_index (id)
);
create index if not exists archive_index_current on public.archive_index (dataset, period) where superseded_by is null;
alter table public.archive_index enable row level security;

-- Kunci bulan yang tetap di Supabase.
create or replace function private.archive_kept_months()
returns text[] language sql stable security definer set search_path = '' as $$
  select array(select distinct m from (
    select to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM') as m
    union select month from public.collection_periods where status <> 'closed'
  ) x order by 1);
$$;

-- Pemakai Supabase service role (cron cadangan) atau Super Admin.
create or replace function private.archive_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(auth.role(), '') = 'service_role' or coalesce(private.is_sa(), false);
$$;

-- Hak baca arsip = hak baca data aslinya (pack_erp / pack_targets / pack_mutasi), ditambah menu Arsip Data.
create or replace function private.archive_can_read(p_dataset text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.archive_admin() or private.is_ctrl() or private.has_menu('set.arsip') or case
    when p_dataset in ('erp_payments', 'erp_invoices') then private.my_kind() = 'coll' or private.has_menu('rek.mutasi')
      or private.has_menu('lap.presentasi') or private.has_menu('rek.marketplace') or private.has_menu('coll.payhist') or private.has_menu('bill.email')
    when p_dataset = 'ar_targets' then private.my_kind() = 'coll' or private.has_menu('rek.mutasi')
    when p_dataset = 'bank_mutations' then private.has_menu('rek.mutasi')
    else false end, false);
$$;

create policy "baca indeks arsip" on public.archive_index for select to authenticated using (private.archive_can_read(dataset));

-- Baris kandidat arsip per (dataset, periode): kunci, nominal, isi baris (jsonb). Kosong bila periode harus tetap di DB.
create or replace function private.archive_rows(p_dataset text, p_period text)
returns table (k text, amount numeric, r jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare kept text[] := private.archive_kept_months();
begin
  if p_dataset = 'erp_payments' then
    if p_period = any (kept) then return; end if;
    -- Salinan data invoice ikut disimpan (kolom `invoice`): History Pembayaran, Mutasi & KPI cukup membaca 1 file per bulan.
    return query select p.id::text, p.amount, to_jsonb(p) || jsonb_build_object('invoice', to_jsonb(e)) from public.erp_payments p
      left join public.erp_invoices e on e.invoice_no = p.invoice_no
      where to_char(p.payment_date, 'YYYY-MM') = p_period;
  elsif p_dataset = 'erp_invoices' then
    if p_period = any (kept) then return; end if;
    return query select e.invoice_no, e.amount, to_jsonb(e) from public.erp_invoices e
      where to_char(e.invoice_date, 'YYYY-MM') = p_period
        and not exists (select 1 from public.erp_payments p where p.invoice_no = e.invoice_no)
        and not exists (select 1 from private.aging_invoice_keys() a where a.invoice_key = e.invoice_no);
  elsif p_dataset = 'aging_snapshot' then
    if p_period = (select s.id::text from public.ar_aging_snapshots s order by s.month desc, s.id desc limit 1) then return; end if;
    if exists (select 1 from public.collection_periods c where c.status <> 'closed' and c.aging_data ->> 'snapshotId' = p_period) then return; end if;
    return query select lpad(l.line_no::text, 8, '0'), l.open_amt, to_jsonb(l) from public.ar_aging_lines l
      where l.snapshot_id::text = p_period;
  elsif p_dataset = 'ar_targets' then
    if not exists (select 1 from public.collection_periods c where c.month = p_period and c.status = 'closed') then return; end if;
    return query select t.invoice_no, t.target, to_jsonb(t) from public.ar_targets t where t.month = p_period;
  elsif p_dataset = 'bank_mutations' then
    if p_period = any (kept) then return; end if;
    -- Dari view: status "dikecualikan" + catatannya ikut tersimpan (bentuk sama dengan paket Mutasi).
    return query select m.id::text, m.amount, to_jsonb(m) from public.v_bank_mutations m
      where to_char(m.tx_date, 'YYYY-MM') = p_period;
  else
    raise exception 'Dataset arsip tidak dikenal: %', p_dataset using errcode = '22023';
  end if;
end $$;

-- Daftar periode yang bisa diarsip (Super Admin).
create or replace function public.archive_candidates()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb := '[]'::jsonb; ds text; per text; lbl text; n integer; amt numeric;
begin
  if not private.archive_admin() then raise exception 'Akses ditolak: khusus Super Admin' using errcode = '42501'; end if;
  for ds, per, lbl in
    select 'erp_payments', m, null from (select distinct to_char(payment_date, 'YYYY-MM') m from public.erp_payments) x
    union all select 'erp_invoices', m, null from (select distinct to_char(invoice_date, 'YYYY-MM') m from public.erp_invoices) x
    union all select 'aging_snapshot', s.id::text, 'Aging ' || s.month || coalesce(' · ' || to_char(coalesce(s.report_date, s.as_of), 'DD-MM-YYYY'), '')
      from public.ar_aging_snapshots s
    union all select 'ar_targets', m, null from (select distinct month m from public.ar_targets) x
    union all select 'bank_mutations', m, null from (select distinct to_char(tx_date, 'YYYY-MM') m from public.bank_mutations) x
  loop
    select count(*), coalesce(sum(a.amount), 0) into n, amt from private.archive_rows(ds, per) a;
    if n > 0 then
      v := v || jsonb_build_object('dataset', ds, 'period', per, 'label', lbl, 'rows', n, 'amount', amt,
        'archived', (select jsonb_build_object('id', i.id, 'rows', i.rows, 'at', i.created_at) from public.archive_index i
                     where i.dataset = ds and i.period = per and i.superseded_by is null));
    end if;
  end loop;
  return v;
end $$;

-- Ekspor satu halaman baris (urut kunci). Halaman pertama juga mengembalikan total baris & nominal.
create or replace function public.archive_export(p_dataset text, p_period text, p_offset integer, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_rows jsonb; v_total integer; v_amount numeric;
begin
  if not private.archive_admin() then raise exception 'Akses ditolak: khusus Super Admin' using errcode = '42501'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 10000 then raise exception 'p_limit 1..10000' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(x.r order by x.k), '[]'::jsonb) into v_rows
    from (select a.k, a.r from private.archive_rows(p_dataset, p_period) a order by a.k offset greatest(p_offset, 0) limit p_limit) x;
  if coalesce(p_offset, 0) = 0 then
    select count(*), coalesce(sum(a.amount), 0) into v_total, v_amount from private.archive_rows(p_dataset, p_period) a;
  end if;
  return jsonb_build_object('rows', v_rows, 'total', v_total, 'amount', v_amount);
end $$;

-- Catat file arsip yang sudah tersimpan & terverifikasi di Drive. Versi lama periode yang sama ditandai digantikan.
create or replace function public.archive_record(p_dataset text, p_period text, p_label text, p_file_id text, p_file_name text,
  p_rows integer, p_db_rows integer, p_db_amount numeric, p_bytes integer, p_sha256 text)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_id bigint;
begin
  if not private.archive_admin() then raise exception 'Akses ditolak: khusus Super Admin' using errcode = '42501'; end if;
  insert into public.archive_index (dataset, period, label, file_id, file_name, rows, db_rows, db_amount, bytes, sha256)
    values (p_dataset, p_period, p_label, p_file_id, p_file_name, p_rows, p_db_rows, coalesce(p_db_amount, 0), p_bytes, p_sha256)
    returning id into v_id;
  update public.archive_index set superseded_by = v_id
    where dataset = p_dataset and period = p_period and superseded_by is null and id <> v_id;
  return v_id;
end $$;

-- Hapus baris yang sudah diarsip. Ditolak bila data berubah sejak diekspor (jumlah baris / nominal berbeda).
create or replace function public.archive_purge(p_id bigint)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare a public.archive_index; n integer; amt numeric; v_del integer;
begin
  if not private.archive_admin() then raise exception 'Akses ditolak: khusus Super Admin' using errcode = '42501'; end if;
  select * into a from public.archive_index where id = p_id for update;
  if not found then raise exception 'Arsip % tidak ditemukan', p_id using errcode = 'P0002'; end if;
  if a.superseded_by is not null then raise exception 'Arsip % sudah digantikan versi baru', p_id using errcode = '55000'; end if;
  if a.purged_at is not null then return 0; end if;
  select count(*), coalesce(sum(x.amount), 0) into n, amt from private.archive_rows(a.dataset, a.period) x;
  if n <> a.db_rows or amt <> a.db_amount then
    raise exception 'Data % % berubah sejak diarsip (% baris sekarang, % di arsip). Arsipkan ulang.', a.dataset, a.period, n, a.db_rows
      using errcode = '55000';
  end if;
  perform set_config('arsip.purge', 'on', true); -- jalur khusus penjaga target bulan Closed (hanya di transaksi ini)
  if a.dataset = 'erp_payments' then
    delete from public.erp_payments where to_char(payment_date, 'YYYY-MM') = a.period;
  elsif a.dataset = 'erp_invoices' then
    delete from public.erp_invoices where invoice_no in (select x.k from private.archive_rows(a.dataset, a.period) x);
  elsif a.dataset = 'aging_snapshot' then
    delete from public.ar_aging_lines where snapshot_id::text = a.period;
    get diagnostics v_del = row_count;
    delete from public.ar_aging_snapshots where id::text = a.period;
  elsif a.dataset = 'ar_targets' then
    delete from public.ar_targets where month = a.period;
  elsif a.dataset = 'bank_mutations' then
    delete from public.bank_mutations where to_char(tx_date, 'YYYY-MM') = a.period;
  end if;
  if a.dataset <> 'aging_snapshot' then get diagnostics v_del = row_count; end if;
  perform set_config('arsip.purge', '', true);
  update public.archive_index set purged_at = now(), purged_rows = v_del where id = p_id;
  insert into public.cleanup_log (by_user, mode, category, rows, detail)
    values (auth.uid(), 'arsip', 'arsip:' || a.dataset, v_del, jsonb_build_object('period', a.period, 'archive_id', p_id, 'file', a.file_name));
  return v_del;
end $$;

-- Daftar arsip yang boleh dibaca pengguna (halaman Arsip Data & penarikan otomatis).
create or replace function public.archive_list(p_dataset text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'dataset', dataset, 'period', period, 'label', label, 'rows', rows,
    'bytes', bytes, 'createdAt', created_at, 'purgedAt', purged_at, 'fileName', file_name) order by dataset, period desc), '[]'::jsonb)
  from public.archive_index
  where superseded_by is null and (p_dataset is null or dataset = p_dataset) and private.archive_can_read(dataset);
$$;

-- File Drive untuk satu arsip (dipakai route handler; hak baca dicek di sini).
create or replace function public.archive_file(p_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.archive_index;
begin
  select * into a from public.archive_index where id = p_id;
  if not found or not private.archive_can_read(a.dataset) then raise exception 'Arsip tidak ditemukan / akses ditolak' using errcode = '42501'; end if;
  return jsonb_build_object('id', a.id, 'dataset', a.dataset, 'period', a.period, 'fileId', a.file_id, 'fileName', a.file_name,
    'sha256', a.sha256, 'rows', a.rows);
end $$;

-- cleanup_log menerima mode 'arsip'.
alter table public.cleanup_log drop constraint if exists cleanup_log_mode_check;
alter table public.cleanup_log add constraint cleanup_log_mode_check check (mode = any (array['otomatis', 'manual', 'konfirmasi', 'arsip']));

-- Penjaga target bulan Closed: izinkan DELETE hanya dari archive_purge (setting lokal transaksi, tidak bisa disetel lewat API).
do $$
declare d text;
begin
  select pg_get_functiondef('private.collection_target_guard()'::regprocedure) into d;
  if position('arsip.purge' in d) = 0 then
    d := replace(d, 'declare m text; s text;' || chr(10) || 'begin',
      'declare m text; s text;' || chr(10) || 'begin' || chr(10) ||
      '  if tg_op = ''DELETE'' and coalesce(current_setting(''arsip.purge'', true), '''') = ''on'' then return old; end if;');
    if position('arsip.purge' in d) = 0 then raise exception 'collection_target_guard: titik sisip tidak ditemukan'; end if;
    execute d;
  end if;
end $$;

-- aging_commit: snapshot lama hanya dihapus otomatis bila SUDAH diarsip (dulu: dihapus tanpa arsip, sisa 2 terbaru).
do $$
declare d text; hook text := 'where id <> v_snap and id not in (select id from public.ar_aging_snapshots order by month desc limit 2)';
begin
  select pg_get_functiondef('public.aging_commit(uuid)'::regprocedure) into d;
  if position('archive_index' in d) = 0 then
    if position(hook in d) = 0 then raise exception 'aging_commit: retensi snapshot tidak ditemukan'; end if;
    d := replace(d, hook, hook || chr(10) || '      and exists (select 1 from public.archive_index ai where ai.dataset = ''aging_snapshot'''
      || ' and ai.period = public.ar_aging_snapshots.id::text and ai.superseded_by is null and ai.purged_at is not null)');
    execute d;
  end if;
end $$;

-- Staging upload yang ditinggal: dibersihkan setelah 3 jam (dulu 1 hari; satu staging Aging ±43 MB).
do $$
declare d text;
begin
  select pg_get_functiondef('public.upload_begin(text,text,text,jsonb)'::regprocedure) into d;
  if position('interval ''1 day''' in d) > 0 then
    execute replace(d, 'interval ''1 day''', 'interval ''3 hours''');
  end if;
end $$;

revoke all on function public.archive_candidates(), public.archive_export(text, text, integer, integer),
  public.archive_record(text, text, text, text, text, integer, integer, numeric, integer, text), public.archive_purge(bigint) from anon;
revoke all on function public.archive_list(text), public.archive_file(bigint) from anon;

-- ── Cadangan mingguan tabel master (route /api/backup/weekly, Vercel Cron) ───────────────────────
-- Semua tabel public KECUALI data besar yang ditangani arsip / bisa diambil ulang dari ERP & tabel turunan.
create or replace function private.backup_table_list()
returns text[] language sql stable security definer set search_path = '' as $$
  select array(select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not in ('ar_aging_lines', 'ar_aging_snapshots', 'erp_invoices', 'erp_payments', 'ar_targets', 'bank_mutations',
                            'mp_order_index', 'data_versions', 'deck_derived', 'archive_index')
    order by 1);
$$;

create or replace function public.backup_tables()
returns text[] language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.archive_admin() then raise exception 'Akses ditolak: khusus Super Admin' using errcode = '42501'; end if;
  return private.backup_table_list();
end $$;

-- Isi satu tabel (jsonb array). Kolom rahasia (pin_hash) tidak ikut.
create or replace function public.backup_table(p_table text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not private.archive_admin() then raise exception 'Akses ditolak: khusus Super Admin' using errcode = '42501'; end if;
  if not (p_table = any (private.backup_table_list())) then raise exception 'Tabel % tidak termasuk cadangan', p_table using errcode = '22023'; end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t) - ''pin_hash''), ''[]''::jsonb) from public.%I t', p_table) into v;
  return v;
end $$;

revoke all on function public.backup_tables(), public.backup_table(text) from anon;

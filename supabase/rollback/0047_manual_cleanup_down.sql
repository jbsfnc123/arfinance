-- Rollback 0047 (Fase 48): kembali ke penghapusan otomatis 0045/0046, foto kolektor wajib, tanpa kategori penerimaan_sj.
drop function if exists public.pack_sj_receive();
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
create or replace function public.cleanup_run_pending()
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.is_sa() then raise exception 'Akses ditolak: khusus Super Admin' using errcode = '42501'; end if;
  return private.prune_ephemeral(true, 'konfirmasi');
end;
$$;
revoke execute on function public.cleanup_run_pending() from public, anon;
grant execute on function public.cleanup_run_pending() to authenticated;
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
create or replace function public.courier_submit(p_invoices jsonb, p_tanggal date, p_ket_done text, p_ket_pending text, p_foto_path text, p_kurir text)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_kind  text := private.my_kind();
  v_kurir text;
  v_kode  text;
  v_count integer;
  v_done  integer;
begin
  if not (v_kind in ('sa', 'ctrl', 'kurir') and private.has_menu('tukar.detail')) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if p_tanggal is null then
    raise exception 'Tanggal diterima wajib diisi' using errcode = '22023';
  end if;
  v_kurir := case when v_kind = 'kurir' then private.my_name() else nullif(trim(p_kurir), '') end;
  if v_kurir is null then
    raise exception 'Nama kurir wajib diisi' using errcode = '22023';
  end if;

  drop table if exists pg_temp._sel;
  create temp table _sel on commit drop as
  select s.*, coalesce(x.done, false) as done
  from jsonb_to_recordset(p_invoices) as x(invoice_no text, done boolean)
  join public.courier_schedules s on s.invoice_no = x.invoice_no
  where not exists (select 1 from public.courier_updates u where u.invoice_no = s.invoice_no);

  select count(*), count(*) filter (where done) into v_count, v_done from _sel;
  if v_count = 0 then
    raise exception 'Invoice sudah diproses atau tidak ada di jadwal' using errcode = '22023';
  end if;
  if v_done > 0 and nullif(trim(p_foto_path), '') is null then
    raise exception 'Foto tanda terima wajib untuk invoice Done' using errcode = '22023';
  end if;

  v_kode := case when v_done > 0 then to_char(now() at time zone 'Asia/Jakarta', 'DD-MM-YY-HH24MISS') end;

  insert into public.courier_updates
    (invoice_no, business_partner, invoice_date, open_amt, tanggal_tukar, status, keterangan, kode, foto_path, kurir)
  select invoice_no, business_partner, invoice_date, open_amt, p_tanggal,
         case when done then 'Done' else 'Pending' end,
         nullif(trim(case when done then p_ket_done else p_ket_pending end), ''),
         case when done then v_kode end,
         case when done then p_foto_path end,
         v_kurir
  from _sel;

  insert into public.invoice_exchanges
    (invoice_no, metode, tanggal, keterangan, foto_path, kurir, collection_name)
  select s.invoice_no, 'Kolektor', p_tanggal, v_kode, p_foto_path, v_kurir, a.collection_name
  from _sel s left join public.ar_invoices a on a.invoice_no = s.invoice_no
  where s.done;

  return jsonb_build_object('count', v_count, 'done', v_done, 'kode', v_kode, 'kurir', v_kurir);
end;
$function$;

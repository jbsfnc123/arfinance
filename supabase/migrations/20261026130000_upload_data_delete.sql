-- Fase 71: hapus data hasil upload (CSV/Excel) per periode — Pengaturan › Arsip Data, khusus Super Admin.
-- Registri dataset (private.upload_ds): sumber baris, ekspresi periode (YYYY-MM, atau 'semua' untuk tabel yang selalu diganti
-- utuh), nominal, perintah hapus, & kunci data_versions. Pratinjau, ekspor cadangan & hapus memakai definisi yang sama.
-- Hapus menolak bila jumlah baris berubah sejak pratinjau, atau periode dikunci (Target periode Closed; Aging terbaru / yang
-- dipakai periode Collection Open). Dicatat di cleanup_log (mode 'hapus_upload').

alter table public.cleanup_log drop constraint if exists cleanup_log_mode_check;
alter table public.cleanup_log add constraint cleanup_log_mode_check
  check (mode = any (array['otomatis', 'manual', 'konfirmasi', 'arsip', 'hapus_upload']));

create or replace function private.upload_ds(p_dataset text)
returns jsonb language sql immutable set search_path = '' as $$
  select case p_dataset
    when 'mutasi' then jsonb_build_object('label', 'Mutasi Rekening', 'unit', 'Tanggal transaksi',
      'src', 'public.bank_mutations', 'per', 'to_char(tx_date, ''YYYY-MM'')', 'amt', 'amount',
      'del', 'delete from public.bank_mutations where to_char(tx_date, ''YYYY-MM'') = %L', 'keys', '["mutasi"]'::jsonb, 'archive', 'bank_mutations')
    when 'erp_payments' then jsonb_build_object('label', 'Pelunasan / Pembayaran ERP', 'unit', 'Payment date',
      'src', 'public.erp_payments', 'per', 'to_char(payment_date, ''YYYY-MM'')', 'amt', 'amount',
      'del', 'delete from public.erp_payments where to_char(payment_date, ''YYYY-MM'') = %L', 'keys', '["erp"]'::jsonb, 'archive', 'erp_payments')
    when 'erp_invoices' then jsonb_build_object('label', 'Invoice ERP', 'unit', 'Invoice date',
      'src', 'public.erp_invoices', 'per', 'to_char(invoice_date, ''YYYY-MM'')', 'amt', 'amount',
      'del', 'delete from public.erp_invoices where to_char(invoice_date, ''YYYY-MM'') = %L', 'keys', '["erp"]'::jsonb, 'archive', 'erp_invoices')
    when 'targets' then jsonb_build_object('label', 'Target Collection', 'unit', 'Bulan target',
      'src', 'public.ar_targets', 'per', 'month', 'amt', 'target',
      'del', 'delete from public.ar_targets where month = %L', 'keys', '["targets","ar_targets"]'::jsonb, 'archive', 'ar_targets')
    when 'aging' then jsonb_build_object('label', 'Snapshot Aging', 'unit', 'Bulan snapshot',
      'src', 'public.ar_aging_lines l join public.ar_aging_snapshots s on s.id = l.snapshot_id', 'per', 's.month', 'amt', 'l.open_amt',
      'del', 'delete from public.ar_aging_snapshots where month = %L', 'keys', '["aging","ar_invoices"]'::jsonb, 'archive', 'aging_snapshot')
    when 'sj_receipts' then jsonb_build_object('label', 'Penerimaan SJ (Monitor Surat Jalan)', 'unit', 'Receive date',
      'src', 'public.sj_receipts', 'per', 'to_char(receive_date, ''YYYY-MM'')', 'amt', '0',
      'del', 'delete from public.sj_receipts where to_char(receive_date, ''YYYY-MM'') = %L', 'keys', '["sj"]'::jsonb)
    when 'm10_kwitansi' then jsonb_build_object('label', 'Kwitansi Mitra10', 'unit', 'Tanggal kuitansi',
      'src', 'public.m10_kwitansi', 'per', 'coalesce(to_char(kuitansi_date, ''YYYY-MM''), ''(tanpa tanggal)'')', 'amt', 'total_net',
      'del', 'delete from public.m10_kwitansi where coalesce(to_char(kuitansi_date, ''YYYY-MM''), ''(tanpa tanggal)'') = %L', 'keys', '["m10"]'::jsonb)
    when 'm10_gr' then jsonb_build_object('label', 'GR Mitra10 (Receiving)', 'unit', 'Bulan upload',
      'src', 'public.m10_gr', 'per', 'to_char(created_at at time zone ''Asia/Jakarta'', ''YYYY-MM'')', 'amt', '0',
      'del', 'delete from public.m10_gr where to_char(created_at at time zone ''Asia/Jakarta'', ''YYYY-MM'') = %L', 'keys', '["m10"]'::jsonb)
    when 'cbd_sales' then jsonb_build_object('label', 'CBD Sales (Email Customer)', 'unit', 'Tanggal transaksi',
      'src', 'public.email_sales_marks', 'per', 'to_char(sale_date, ''YYYY-MM'')', 'amt', '0',
      'del', 'delete from public.email_sales_marks where to_char(sale_date, ''YYYY-MM'') = %L', 'keys', '["email_customer"]'::jsonb)
    when 'coretax' then jsonb_build_object('label', 'XML CoreTax', 'unit', 'Bulan upload',
      'src', 'public.coretax_lines l join public.coretax_batches b on b.id = l.batch_id',
      'per', 'to_char(b.created_at at time zone ''Asia/Jakarta'', ''YYYY-MM'')', 'amt', 'l.tax_base',
      'del', 'delete from public.coretax_batches where to_char(created_at at time zone ''Asia/Jakarta'', ''YYYY-MM'') = %L', 'keys', '["faktur"]'::jsonb)
    when 'jadwal_kolektor' then jsonb_build_object('label', 'Jadwal Kolektor (Upload Jadwal)', 'unit', 'Semua (diganti utuh setiap upload)',
      'src', 'public.courier_schedules', 'per', '''semua''', 'amt', 'open_amt',
      'del', 'delete from public.courier_schedules where %L = ''semua''', 'keys', '["tukar"]'::jsonb)
    when 'rkm_gr' then jsonb_build_object('label', 'Receiving RKM', 'unit', 'Semua (diganti utuh setiap upload)',
      'src', 'public.rkm_gr', 'per', '''semua''', 'amt', 'jumlah',
      'del', 'delete from public.rkm_gr where %L = ''semua''', 'keys', '["rkm"]'::jsonb)
    when 'rkm_kwitansi' then jsonb_build_object('label', 'Kwitansi RKM', 'unit', 'Semua (diganti utuh setiap upload)',
      'src', 'public.rkm_kwitansi', 'per', '''semua''', 'amt', 'jumlah_faktur_pajak',
      'del', 'delete from public.rkm_kwitansi where %L = ''semua''', 'keys', '["rkm"]'::jsonb)
    when 'so_master' then jsonb_build_object('label', 'SO Master (Cek Harga)', 'unit', 'Semua (diganti utuh setiap upload)',
      'src', 'public.so_master', 'per', '''semua''', 'amt', 'grand_total',
      'del', 'delete from public.so_master where %L = ''semua''', 'keys', '["cekharga"]'::jsonb)
  end
$$;

/** Alasan periode tidak boleh dihapus (null = boleh). */
create or replace function private.upload_lock(p_dataset text, p_period text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_snap bigint;
begin
  if p_dataset = 'targets' and exists (select 1 from public.collection_periods where month = p_period and status = 'closed') then
    return 'Periode Collection sudah Closed';
  end if;
  if p_dataset = 'aging' then
    select id into v_snap from public.ar_aging_snapshots where month = p_period;
    if v_snap is not null and v_snap = (select id from public.ar_aging_snapshots order by month desc limit 1) then
      return 'Aging aktif (terbaru) — upload Aging baru untuk menggantinya';
    end if;
    if exists (select 1 from public.collection_periods where status = 'open' and (aging_data->>'snapshotId')::bigint = v_snap) then
      return 'Dipakai periode Collection yang masih Open';
    end if;
  end if;
  return null;
end $$;

create or replace function public.upload_data_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d text; ds jsonb; out jsonb := '[]'::jsonb; periods jsonb;
begin
  if not private.archive_admin() then raise exception 'Akses ditolak' using errcode = '42501'; end if;
  foreach d in array array['mutasi', 'erp_payments', 'erp_invoices', 'targets', 'aging', 'sj_receipts', 'm10_kwitansi', 'm10_gr',
                           'cbd_sales', 'coretax', 'jadwal_kolektor', 'rkm_gr', 'rkm_kwitansi', 'so_master'] loop
    ds := private.upload_ds(d);
    execute format('select coalesce(jsonb_agg(jsonb_build_object(''period'', p, ''rows'', n, ''amount'', a) order by p desc), ''[]''::jsonb)
                    from (select %s as p, count(*) as n, coalesce(sum(%s), 0) as a from %s group by 1) t where p is not null',
                   ds->>'per', ds->>'amt', ds->>'src') into periods;
    -- Penanda: dikunci & ada arsip Drive.
    select coalesce(jsonb_agg(x.e || jsonb_build_object('locked', private.upload_lock(d, x.e->>'period'),
        'archived', exists (select 1 from public.archive_index ai where ai.dataset = ds->>'archive' and ai.superseded_by is null
          and ai.period = case when d = 'aging' then (select s.id::text from public.ar_aging_snapshots s where s.month = x.e->>'period')
                               else x.e->>'period' end))), '[]'::jsonb)
      into periods from jsonb_array_elements(periods) x(e);
    out := out || jsonb_build_array(jsonb_build_object('dataset', d, 'label', ds->>'label', 'unit', ds->>'unit',
      'hasAmount', ds->>'amt' <> '0', 'periods', periods));
  end loop;
  return out;
end $$;

/** Baris yang akan dihapus (cadangan Excel sebelum hapus), per halaman. */
create or replace function public.upload_data_export(p_dataset text, p_period text, p_offset integer default 0, p_limit integer default 5000)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare ds jsonb := private.upload_ds(p_dataset); r jsonb; v_sel text;
begin
  if not private.archive_admin() then raise exception 'Akses ditolak' using errcode = '42501'; end if;
  if ds is null then raise exception 'Jenis data tidak dikenal' using errcode = '22023'; end if;
  v_sel := case p_dataset when 'aging' then 's.month, l.*' when 'coretax' then 'b.file_name, l.*' else '*' end;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select %s from %s where %s = %L order by 1 offset %s limit %s) t',
                 v_sel, ds->>'src', ds->>'per', p_period, greatest(p_offset, 0), least(greatest(p_limit, 1), 10000)) into r;
  return r;
end $$;

create or replace function public.upload_data_delete(p_dataset text, p_period text, p_expect_rows integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ds jsonb := private.upload_ds(p_dataset); v_rows integer; v_amt numeric; v_lock text; v_del integer; k text;
begin
  if not private.archive_admin() then raise exception 'Akses ditolak' using errcode = '42501'; end if;
  if ds is null then raise exception 'Jenis data tidak dikenal' using errcode = '22023'; end if;
  if p_period is null or not (p_period ~ '^\d{4}-\d{2}$' or p_period in ('semua', '(tanpa tanggal)')) then
    raise exception 'Periode tidak valid' using errcode = '22023';
  end if;
  v_lock := private.upload_lock(p_dataset, p_period);
  if v_lock is not null then raise exception 'Tidak bisa dihapus: %', v_lock using errcode = '55000'; end if;
  execute format('select count(*), coalesce(sum(%s), 0) from %s where %s = %L', ds->>'amt', ds->>'src', ds->>'per', p_period) into v_rows, v_amt;
  if v_rows = 0 then raise exception 'Tidak ada data pada periode ini' using errcode = 'P0002'; end if;
  if v_rows <> p_expect_rows then
    raise exception 'Data berubah sejak pratinjau (% baris, sekarang %). Muat ulang lalu coba lagi.', p_expect_rows, v_rows using errcode = '40001';
  end if;
  if p_dataset = 'targets' then perform set_config('arsip.purge', 'on', true); end if; -- lewati guard closing (periode Open saja)
  execute format(ds->>'del', p_period);
  get diagnostics v_del = row_count;
  for k in select jsonb_array_elements_text(ds->'keys') loop
    update public.data_versions set updated_at = now() where key = k;
  end loop;
  insert into public.cleanup_log (mode, category, rows, detail, by_user)
  values ('hapus_upload', p_dataset, v_rows, jsonb_build_object('period', p_period, 'amount', v_amt, 'label', ds->>'label', 'deleted', v_del), (select auth.uid()));
  return jsonb_build_object('dataset', p_dataset, 'period', p_period, 'rows', v_rows, 'amount', v_amt);
end $$;

revoke execute on function private.upload_ds(text), private.upload_lock(text, text) from public, anon, authenticated;
revoke execute on function public.upload_data_overview(), public.upload_data_export(text, text, integer, integer),
  public.upload_data_delete(text, text, integer) from public, anon;
grant execute on function public.upload_data_overview(), public.upload_data_export(text, text, integer, integer),
  public.upload_data_delete(text, text, integer) to authenticated;

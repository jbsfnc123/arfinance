CREATE OR REPLACE FUNCTION public.aging_commit(p_batch uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  b private.upload_batches;
  v_as_of date; v_month text; v_snap bigint; v_rows integer; v_total numeric;
  v_prev_current bigint; v_is_current boolean; v_lunas integer := 0; v_new integer := 0;
  v_tax text := lower(trim((select value #>> '{}' from public.app_settings where key = 'm10_tax_name')));
begin
  b := private.take_batch(p_batch, 'aging');
  -- File aging (Blank_A4) selalu punya Tax Name dan/atau kolom umur piutang; file Target tidak.
  if not exists (
    select 1 from private.upload_rows u
    where u.batch = p_batch and (
      nullif(trim(u.data->>'tax_name'), '') is not null
      or coalesce((u.data->>'cur_0_30')::numeric, 0) <> 0 or coalesce((u.data->>'cur_31_60')::numeric, 0) <> 0
      or coalesce((u.data->>'due_1_7')::numeric, 0) <> 0 or coalesce((u.data->>'due_8_30')::numeric, 0) <> 0
      or coalesce((u.data->>'due_31_60')::numeric, 0) <> 0 or coalesce((u.data->>'due_61_90')::numeric, 0) <> 0
      or coalesce((u.data->>'due_90')::numeric, 0) <> 0)
  ) then
    raise exception 'File ini terlihat seperti file Target, bukan Aging (tidak ada kolom Tax Name / umur piutang). Upload lewat Target Bulanan.'
      using errcode = '22023';
  end if;
  select max((u.data->>'invoice_date')::date) into v_as_of from private.upload_rows u where u.batch = p_batch;
  if v_as_of is null then
    raise exception 'Kolom Invoice Date tidak berisi tanggal yang bisa dibaca' using errcode = '22023';
  end if;
  v_month := to_char(v_as_of, 'YYYY-MM');
  select id into v_prev_current from public.ar_aging_snapshots order by month desc limit 1;

  delete from public.ar_aging_snapshots where month = v_month;
  insert into public.ar_aging_snapshots (month, as_of, file_name) values (v_month, v_as_of, b.file_name)
  returning id into v_snap;
  insert into public.ar_aging_lines (snapshot_id, line_no, payment_group, limit_group, marketing, collection_name,
    sales_name, bp_key, business_partner, tax_name, invoice_no, invoice_date, due_date, open_amt, cur_0_30, cur_31_60,
    due_1_7, due_8_30, due_31_60, due_61_90, due_90, days, branch, follow_up, no_po, no_sj, area)
  select v_snap, u.seq, r.payment_group, r.limit_group, r.marketing, r.collection_name, r.sales_name, r.bp_key,
    r.business_partner, r.tax_name, nullif(trim(r.invoice_no), ''), r.invoice_date, r.due_date, coalesce(r.open_amt, 0),
    coalesce(r.cur_0_30, 0), coalesce(r.cur_31_60, 0), coalesce(r.due_1_7, 0), coalesce(r.due_8_30, 0),
    coalesce(r.due_31_60, 0), coalesce(r.due_61_90, 0), coalesce(r.due_90, 0), r.days, r.branch, r.follow_up,
    r.no_po, r.no_sj, r.area
  from private.upload_rows u
  cross join lateral jsonb_to_record(u.data) as r(payment_group text, limit_group text, marketing text,
    collection_name text, sales_name text, bp_key text, business_partner text, tax_name text, invoice_no text,
    invoice_date date, due_date date, open_amt numeric, cur_0_30 numeric, cur_31_60 numeric, due_1_7 numeric,
    due_8_30 numeric, due_31_60 numeric, due_61_90 numeric, due_90 numeric, days integer, branch text,
    follow_up text, no_po text, no_sj text, area text)
  where u.batch = p_batch;
  get diagnostics v_rows = row_count;
  select coalesce(sum(open_amt), 0) into v_total from public.ar_aging_lines where snapshot_id = v_snap;
  update public.ar_aging_snapshots set row_count = v_rows, total_open = v_total where id = v_snap;
  delete from private.upload_batches where id = p_batch;

  v_is_current := v_snap = (select id from public.ar_aging_snapshots order by month desc limit 1);
  if v_is_current then
    if v_prev_current is not null then
      select count(distinct upper(o.invoice_no)) into v_lunas
      from public.ar_aging_lines o
      where o.snapshot_id = v_prev_current and lower(trim(o.tax_name)) = v_tax and o.invoice_no is not null
        and not exists (select 1 from public.ar_aging_lines n where n.snapshot_id = v_snap and upper(n.invoice_no) = upper(o.invoice_no));
    end if;
    v_new := private.m10_append_from_aging();
    update public.data_versions set updated_at = now() where key = 'ar_invoices';
    insert into public.app_settings (key, value, updated_by) values ('last_tagihan_update', to_jsonb(now()), (select auth.uid()))
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  end if;

  -- (Presentasi AR tidak lagi memakai data upload — Fase 24)
  -- Retensi: simpan snapshot terbaru + 1 sebelumnya (dan snapshot yang baru saja di-upload).
  delete from public.ar_aging_snapshots
  where id <> v_snap and id not in (select id from public.ar_aging_snapshots order by month desc limit 2);

  insert into public.import_log (module, kind, file_name, months, rows, user_id, file_sha256)
  values ('data', 'aging', b.file_name, array[v_month], v_rows, (select auth.uid()), b.sha256);
  return jsonb_build_object('rows', v_rows, 'month', v_month, 'asOf', v_as_of, 'totalOpen', v_total,
    'current', v_is_current, 'collectionRows', (select count(*) from public.ar_invoices),
    'm10Rows', (select count(*) from public.m10_aging), 'm10NewInvoices', v_new, 'm10Lunas', v_lunas);
end;
$function$;

CREATE OR REPLACE FUNCTION public.ar_target_replace(p_month text, p_rows jsonb, p_file_name text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_count integer;
begin
  if not (private.is_ctrl() and (private.has_menu('set.target') or private.has_menu('rek.mutasi'))) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if p_month !~ '^\d{4}-\d{2}$' then
    raise exception 'Format bulan harus YYYY-MM' using errcode = '22023';
  end if;

  delete from public.ar_targets where month = p_month;
  insert into public.ar_targets
    (month, invoice_no, target, marketing, collection_name, business_partner, due_date, branch, no_sj)
  select distinct on (r.invoice_no)
    p_month, r.invoice_no, r.target,
    coalesce(nullif(trim(r.marketing), ''), a.marketing),
    coalesce(nullif(trim(r.collection_name), ''), a.collection_name),
    coalesce(nullif(trim(r.business_partner), ''), a.business_partner),
    coalesce(r.due_date, a.due_date),
    nullif(trim(r.branch), ''),
    coalesce(nullif(trim(r.no_sj), ''), a.no_sj)
  from jsonb_to_recordset(p_rows) as r(
    invoice_no text, target numeric, marketing text, collection_name text,
    business_partner text, due_date date, branch text, no_sj text)
  left join public.ar_invoices a on a.invoice_no = r.invoice_no
  where nullif(trim(r.invoice_no), '') is not null and r.target is not null
  order by r.invoice_no;
  get diagnostics v_count = row_count;

  update public.data_versions set updated_at = now() where key = 'ar_targets';
  insert into public.import_log (module, kind, file_name, months, rows, user_id)
  values ('collection', 'target', p_file_name, array[p_month], v_count, (select auth.uid()));
  return v_count;
end;
$function$;

-- 0039: Fase 35 — perbaikan audit Fase 34.
-- (1) Keputusan user 2026-09-29: TIDAK ADA batas data antar collection. Akun jenis Collection melihat semua collection
--     (tidak ada data rahasia antar collection); halaman tetap diatur centang menu per akun (profile_menus). Collection
--     Name di profil hanya collection awal Daftar Tagihan (opsional). Diubah lewat penggantian teks yang dicek (pola 0034).
-- (2) pack_erp_recent: data ERP khusus History Pembayaran — hanya invoice BER-TEMPO ("Net N Days", sama dengan hasTempo di
--     lib/modules/collection/payment-history.ts) yang punya due date & dibayar sejak awal 3 bulan sebelum bulan berjalan
--     (±4 bulan), beserta pembayarannya. `counts` = jumlah SEMUA pembayaran per bulan (semua term) untuk peringatan
--     bulan yang belum di-upload. Format invoice/payment sama dengan pack_erp (kamus terms/labels).

create or replace function private.can_see_collection(p_coll text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.my_kind() in ('sa', 'ctrl', 'coll'), false);
$$;

do $$
declare
  v_def text; v_new text;
  r record;
begin
  for r in select * from (values
    ('public.pack_aging()', 'v_kind in (''sa'', ''ctrl'')', 'v_kind in (''sa'', ''ctrl'', ''coll'')'),
    ('public.pack_activity()', 'if v_kind in (''sa'', ''ctrl'') then v_where := ''true'';',
                               'if v_kind in (''sa'', ''ctrl'', ''coll'') then v_where := ''true'';'),
    ('public.pack_erp()', 'if private.is_ctrl() or', 'if private.is_ctrl() or private.my_kind() = ''coll'' or'),
    ('public.pack_targets()', 'if private.is_ctrl() or', 'if private.is_ctrl() or private.my_kind() = ''coll'' or'),
    ('public.pack_remarks()', 'if private.is_ctrl() or', 'if private.is_ctrl() or private.my_kind() = ''coll'' or'),
    ('private.can_remark(jsonb)', 'if private.is_ctrl() or', 'if private.is_ctrl() or private.my_kind() = ''coll'' or')
  ) as t(fn, old_txt, new_txt) loop
    select pg_get_functiondef(r.fn::regprocedure) into v_def;
    v_new := replace(v_def, r.old_txt, r.new_txt);
    if v_new = v_def then
      raise exception '%: teks akses tidak ditemukan', r.fn;
    end if;
    execute v_new;
  end loop;
end $$;

create or replace function public.pack_erp_recent()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_from date := (date_trunc('month', (now() at time zone 'Asia/Jakarta')::date) - interval '3 months')::date;
  v_pay text;
  v_inv text;
begin
  if not (private.is_ctrl() or private.my_kind() = 'coll' or private.has_menu('rek.mutasi') or private.has_menu('lap.presentasi')
          or private.has_menu('rek.marketplace') or private.has_menu('coll.payhist')) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  -- Invoice ber-tempo yang dibayar di rentang; pembayaran hanya milik invoice tersebut.
  v_inv := format('payment_term ~* %L and due_date is not null
                   and invoice_no in (select invoice_no from public.erp_payments where payment_date >= %L)', '^\s*net\s+\d+\s+days?', v_from);
  v_pay := format('payment_date >= %L and invoice_no in (select invoice_no from public.erp_invoices where %s)', v_from, v_inv);
  return jsonb_build_object(
    'from', v_from,
    'counts', (select coalesce(jsonb_object_agg(m, n), '{}'::jsonb) from (
                 select to_char(payment_date, 'YYYY-MM') as m, count(*) as n
                 from public.erp_payments where payment_date >= v_from group by 1) c),
    'invoices', private.pack(
      'select invoice_no, invoice_date, amount, bp_key, due_date,
              dense_rank() over (order by coalesce(payment_term, '''')) - 1 as t,
              dense_rank() over (order by coalesce(bp_name, ''''), coalesce(bp_location, '''')) - 1 as l
       from public.erp_invoices where ' || v_inv || ' order by invoice_date, invoice_no',
      array['invoice_no', 'invoice_date', 'amount', 'bp_key', 'due_date', 't', 'l']),
    'terms', private.dict('select distinct coalesce(payment_term, '''') as a, ''''::text as b from public.erp_invoices where ' || v_inv, false),
    'labels', private.dict('select distinct coalesce(bp_name, '''') as a, coalesce(bp_location, '''') as b from public.erp_invoices where ' || v_inv, true),
    'payments', private.pack('select invoice_no, payment_date, amount from public.erp_payments where ' || v_pay || ' order by payment_date, id',
      array['invoice_no', 'payment_date', 'amount']));
end;
$$;
revoke execute on function public.pack_erp_recent() from public, anon;
grant execute on function public.pack_erp_recent() to authenticated;

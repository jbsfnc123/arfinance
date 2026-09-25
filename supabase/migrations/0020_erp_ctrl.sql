-- 0020: Fase 11 — Dashboard Collection memakai data pembayaran ERP (grafik Alokasi Target &
-- rekonsiliasi Terkumpul vs Allocated in Target) → role controller boleh membaca paket ERP.
-- Submenu Dashboard → Mitra 10 dihapus.

create or replace function public.pack_erp()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (private.is_ctrl() or private.has_menu('rek.mutasi') or private.has_menu('lap.presentasi') or private.has_menu('rek.marketplace')) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'invoices', private.pack('select invoice_no, invoice_date, amount from public.erp_invoices order by invoice_date, invoice_no',
      array['invoice_no', 'invoice_date', 'amount']),
    'payments', private.pack('select invoice_no, payment_date, amount from public.erp_payments order by payment_date, id',
      array['invoice_no', 'payment_date', 'amount']));
end;
$$;

create or replace function public.pack_aging()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_kind text := private.my_kind();
  v_all boolean;
  v_snap public.ar_aging_snapshots;
  v_where text;
begin
  v_all := v_kind in ('sa', 'ctrl') or private.has_menu('rek.mitra10') or private.has_menu('lap.presentasi');
  if not v_all and v_kind is distinct from 'coll' then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  select * into v_snap from public.ar_aging_snapshots order by month desc limit 1;
  v_where := format('snapshot_id = %s', coalesce(v_snap.id, -1))
    || case when v_all then '' else format(' and collection_name = %L', coalesce(private.my_collection(), '')) end;
  return jsonb_build_object(
    'month', v_snap.month, 'uploadedAt', v_snap.created_at,
    'lines', private.pack(
      'select line_no, invoice_no, payment_group, marketing, collection_name, sales_name, bp_key, business_partner,
              tax_name, invoice_date, due_date, open_amt, cur_0_30, cur_31_60, due_1_7, due_8_30, due_31_60,
              due_61_90, due_90, days, branch, no_po, no_sj
       from public.ar_aging_lines where ' || v_where || ' order by line_no',
      array['line_no', 'invoice_no', 'payment_group', 'marketing', 'collection_name', 'sales_name', 'bp_key',
            'business_partner', 'tax_name', 'invoice_date', 'due_date', 'open_amt', 'cur_0_30', 'cur_31_60',
            'due_1_7', 'due_8_30', 'due_31_60', 'due_61_90', 'due_90', 'days', 'branch', 'no_po', 'no_sj']));
end;
$$;

delete from public.role_menus where submenu_id = 'dash.mitra10';

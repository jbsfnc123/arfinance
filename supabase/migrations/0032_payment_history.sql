-- 0032: Fase 26 — Collection › History Pembayaran BP (coll.payhist).
-- Dihitung di browser dari dataset ERP + aging yang sudah ada; tidak ada tabel baru. pack_erp menambah kolom
-- invoice yang dibutuhkan (due_date, payment_term, nama BP) dan akses untuk menu baru. Akun Collection tetap
-- hanya menerima invoice miliknya (cabang 'coll' dicek lebih dulu).

create or replace function public.pack_erp()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_where text;
begin
  if private.is_ctrl() or private.has_menu('rek.mutasi') or private.has_menu('lap.presentasi') or private.has_menu('rek.marketplace') then
    v_where := 'true';
  elsif private.my_kind() = 'coll' then
    v_where := 'invoice_no in (select invoice_no from private.my_collection_invoices())';
  elsif private.has_menu('coll.payhist') then
    v_where := 'true';
  else
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'invoices', private.pack('select invoice_no, invoice_date, amount, bp_key, due_date, payment_term, bp_name, bp_location
                              from public.erp_invoices where ' || v_where || ' order by invoice_date, invoice_no',
      array['invoice_no', 'invoice_date', 'amount', 'bp_key', 'due_date', 'payment_term', 'bp_name', 'bp_location']),
    'payments', private.pack('select invoice_no, payment_date, amount from public.erp_payments where ' || v_where || ' order by payment_date, id',
      array['invoice_no', 'payment_date', 'amount']));
end;
$$;

-- Akses menu: semua role yang punya Daftar Tagihan.
insert into public.role_menus (role_id, submenu_id)
select distinct m.role_id, 'coll.payhist' from public.role_menus m
where m.submenu_id = 'coll.tagihan'
  and not exists (select 1 from public.role_menus x where x.role_id = m.role_id and x.submenu_id = 'coll.payhist');

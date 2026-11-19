-- Fase 83 — Cek Selisih Harga: SO & rekonsiliasi hanya di browser; database hanya menyimpan Arsip & Task Complete
-- (po_so_cases). Selisih otomatis masuk Arsip, hanya No PO yang belum ada (Arsip maupun Task Complete).
-- Rollback: supabase/rollback/20261119100000_cekharga_local_down.sql.

-- ══ ARSIP OTOMATIS ═════════════════════════════════════════════════
-- Masukkan PO selisih ke Arsip; PO yang sudah ada (status apa pun) dilewati. Kembalikan No PO yang BARU masuk.
create or replace function public.po_so_cases_archive(p_rows jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_new text[];
begin
  if not private.has_menu('rek.cekharga') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Data tidak valid' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Terlalu banyak PO (maks. 5000)' using errcode = '22023';
  end if;
  with ins as (
    insert into public.po_so_cases
      (po_customer, document_no, date_po, business_partner, price_list, document_status, total_po, total_so, selisih)
    select distinct on (upper(trim(r.po_customer)))
           upper(trim(r.po_customer)), r.document_no, r.date_po, r.business_partner, r.price_list, r.document_status,
           coalesce(r.total_po, 0), coalesce(r.total_so, 0), coalesce(r.selisih, 0)
    from jsonb_to_recordset(p_rows) as r(po_customer text, document_no text, date_po text, business_partner text,
      price_list text, document_status text, total_po numeric, total_so numeric, selisih numeric)
    where nullif(trim(r.po_customer), '') is not null
    on conflict (po_customer) do nothing
    returning po_customer
  )
  select coalesce(array_agg(po_customer order by po_customer), '{}') into v_new from ins;
  return jsonb_build_object('inserted', to_jsonb(v_new));
end;
$$;
revoke execute on function public.po_so_cases_archive(jsonb) from public, anon;
grant execute on function public.po_so_cases_archive(jsonb) to authenticated;

-- Tabel so_master + RPC so_master_load/get_so_pivot TIDAK dihapus (keputusan user): tetap ada tetapi kosong dan tidak
-- dipakai aplikasi lagi — SO kini hanya di browser. Bisa dihapus di migrasi terpisah bila sudah tidak diperlukan.

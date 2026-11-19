-- Rollback Fase 84 (20261120100000_cekharga_tanda.sql).
-- Catatan: tanda row_flags m10 yang sudah tersinkron dari Cek Harga TIDAK dihapus (tetap sebagai tanda Mitra10 biasa).

drop trigger if exists m10_worksheet_po_tanda_ins on public.m10_worksheet;
drop trigger if exists m10_worksheet_po_tanda_upd on public.m10_worksheet;
drop function if exists private.m10_worksheet_po_tanda();
drop function if exists public.po_so_cases_set_tanda(bigint[], text);
drop function if exists public.po_so_cases_delete(bigint[]);

-- row_flags_set kembali ke definisi 20261118130000_row_flags_tolakan.sql
create or replace function public.row_flags_set(p_module text, p_ids bigint[], p_flag text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_menu text;
  v_ids bigint[];
  v_found integer;
  v_count integer;
begin
  v_menu := case p_module when 'm10' then 'rek.mitra10' when 'rkm' then 'tukar.rkm' end;
  if v_menu is null then
    raise exception 'Modul tidak dikenal' using errcode = '22023';
  end if;
  if not private.has_menu(v_menu) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if p_flag is not null and p_flag not in ('tolakan', 'ltkp', 'litigasi') then
    raise exception 'Tanda tidak dikenal' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_ids) x where x is not null;
  if cardinality(v_ids) = 0 then
    raise exception 'Tidak ada baris yang dipilih' using errcode = '22023';
  end if;
  if cardinality(v_ids) > 5000 then
    raise exception 'Terlalu banyak baris (maks. 5000)' using errcode = '22023';
  end if;
  if p_module = 'm10' then
    select count(*) into v_found from public.m10_worksheet where id = any(v_ids);
  else
    select count(*) into v_found from public.rkm_worksheet where id = any(v_ids);
  end if;
  if v_found <> cardinality(v_ids) then
    raise exception '% baris tidak ditemukan di Kertas Kerja', cardinality(v_ids) - v_found using errcode = 'P0002';
  end if;

  if p_flag is null then
    delete from public.row_flags where module = p_module and worksheet_id = any(v_ids);
  else
    insert into public.row_flags (module, worksheet_id, flag, updated_by, updated_at)
    select p_module, x, p_flag, auth.uid(), now() from unnest(v_ids) x
    on conflict (module, worksheet_id) do update
      set flag = excluded.flag, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  end if;
  get diagnostics v_count = row_count;
  return jsonb_build_object('count', v_count, 'at', now());
end;
$$;

-- po_so_cases_archive kembali ke definisi 20261119100000_cekharga_local.sql
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

drop function if exists private.sync_po_tanda(text[], text);
drop index if exists public.m10_worksheet_po_key;

grant insert, update, delete, truncate on public.po_so_cases to anon, authenticated;
alter table public.po_so_cases drop column if exists tanda;

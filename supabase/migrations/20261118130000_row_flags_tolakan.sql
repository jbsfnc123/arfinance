-- Fase 82b — tanda ketiga "tolakan" untuk row_flags (Tolakan, LTKP, Litigasi).
-- Hanya mengubah check constraint & validasi RPC row_flags_set, lalu mengisi tanda awal dari Keterangan yang mengandung
-- kata "tolakan" (aturan sama dengan Fase 82). Baris yang sudah bertanda tidak diubah; teks Keterangan tidak diubah.
-- Rollback: hapus baris flag = 'tolakan', lalu kembalikan constraint & fungsi dari 20261118120000_row_flags.sql.

alter table public.row_flags drop constraint row_flags_flag_check;
alter table public.row_flags add constraint row_flags_flag_check check (flag in ('tolakan', 'ltkp', 'litigasi'));
comment on table public.row_flags is 'Tanda Tolakan / LTKP / Litigasi per baris Kertas Kerja (Mitra10/RKM). Anotasi manual; tanpa baris = Normal.';

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

insert into public.row_flags (module, worksheet_id, flag, updated_by)
select distinct on (w.id) 'm10', w.id, 'tolakan', null::uuid
from public.m10_worksheet w
join public.invoice_remarks r on r.ref = private.remark_ref(w.no_sj, w.invoice_no)
where r.keterangan ilike '%tolakan%'
order by w.id
on conflict (module, worksheet_id) do nothing;

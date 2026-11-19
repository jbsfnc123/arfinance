-- Fase 84 — Arsip & Task Complete Cek Selisih Harga: tanda Tolakan / LTKP / Litigasi per PO, tersinkron DUA ARAH dengan
-- tanda invoice Mitra10 Tukar Faktur (row_flags module m10) lewat No PO: upper(trim(m10_worksheet.no_po)) = po_so_cases.po_customer.
--   • Tandai PO di Cek Harga  → semua invoice Mitra10 dengan PO itu ikut bertanda.
--   • Tandai invoice di Mitra10 → PO itu (bila ada di Cek Harga) + invoice lain dengan PO sama ikut bertanda.
--   • Invoice Mitra10 yang muncul kemudian (sinkron aging) mewarisi tanda PO-nya.
-- Hanya tanda yang tersinkron (Keterangan tidak). Kolom aksi & tindakan dibiarkan (usang, tidak dipakai aplikasi).
-- Rollback: supabase/rollback/20261120100000_cekharga_tanda_down.sql.

-- ══ KOLOM ══════════════════════════════════════════════════════════
alter table public.po_so_cases add column tanda text check (tanda in ('tolakan', 'ltkp', 'litigasi'));
comment on column public.po_so_cases.tanda is 'Tanda Tolakan / LTKP / Litigasi (null = Normal). Tersinkron dengan row_flags m10 lewat No PO — ubah hanya lewat RPC.';
comment on column public.po_so_cases.aksi is 'USANG (Fase 84): diganti kolom tanda; tidak dipakai aplikasi.';
comment on column public.po_so_cases.tindakan is 'USANG (Fase 84): tidak dipakai aplikasi.';

create index if not exists m10_worksheet_po_key on public.m10_worksheet (upper(trim(no_po)));

-- Isi awal: dari Aksi lama, lalu (bila masih kosong) dari tanda Mitra10 terbaru untuk PO yang sama.
update public.po_so_cases set tanda = case aksi when 'Litigasi' then 'litigasi' when 'LTKP' then 'ltkp' end
where aksi in ('Litigasi', 'LTKP');

update public.po_so_cases c set tanda = t.flag
from (
  select distinct on (upper(trim(w.no_po))) upper(trim(w.no_po)) as po, f.flag
  from public.row_flags f join public.m10_worksheet w on w.id = f.worksheet_id
  where f.module = 'm10'
  order by upper(trim(w.no_po)), f.updated_at desc
) t
where c.po_customer = t.po and c.tanda is null;

-- ══ SINKRON ════════════════════════════════════════════════════════
-- Satu-satunya jalur sinkron: set tanda PO di Cek Harga + semua invoice Mitra10 dengan PO tsb (null = Normal).
create or replace function private.sync_po_tanda(p_pos text[], p_flag text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if cardinality(p_pos) = 0 then return; end if;
  update public.po_so_cases set tanda = p_flag
  where po_customer = any(p_pos) and tanda is distinct from p_flag;
  if p_flag is null then
    delete from public.row_flags f using public.m10_worksheet w
    where f.module = 'm10' and f.worksheet_id = w.id and upper(trim(w.no_po)) = any(p_pos);
  else
    insert into public.row_flags (module, worksheet_id, flag, updated_by, updated_at)
    select 'm10', w.id, p_flag, auth.uid(), now()
    from public.m10_worksheet w where upper(trim(w.no_po)) = any(p_pos)
    on conflict (module, worksheet_id) do update
      set flag = excluded.flag, updated_by = excluded.updated_by, updated_at = excluded.updated_at
      where public.row_flags.flag is distinct from excluded.flag;
  end if;
end;
$$;
revoke execute on function private.sync_po_tanda(text[], text) from public, anon, authenticated;

-- ══ RPC CEK HARGA ══════════════════════════════════════════════════
create or replace function public.po_so_cases_set_tanda(p_ids bigint[], p_flag text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_ids bigint[];
  v_pos text[];
  v_inv integer;
begin
  if not private.has_menu('rek.cekharga') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if p_flag is not null and p_flag not in ('tolakan', 'ltkp', 'litigasi') then
    raise exception 'Tanda tidak dikenal' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_ids) x where x is not null;
  if cardinality(v_ids) = 0 then
    raise exception 'Tidak ada PO yang dipilih' using errcode = '22023';
  end if;
  if cardinality(v_ids) > 5000 then
    raise exception 'Terlalu banyak PO (maks. 5000)' using errcode = '22023';
  end if;
  select coalesce(array_agg(po_customer), '{}') into v_pos from public.po_so_cases where id = any(v_ids);
  if cardinality(v_pos) <> cardinality(v_ids) then
    raise exception '% PO tidak ditemukan', cardinality(v_ids) - cardinality(v_pos) using errcode = 'P0002';
  end if;
  perform private.sync_po_tanda(v_pos, p_flag);
  select count(*) into v_inv from public.m10_worksheet where upper(trim(no_po)) = any(v_pos);
  return jsonb_build_object('cases', cardinality(v_pos), 'invoices', v_inv);
end;
$$;
revoke execute on function public.po_so_cases_set_tanda(bigint[], text) from public, anon;
grant execute on function public.po_so_cases_set_tanda(bigint[], text) to authenticated;

-- Hapus PO dari Arsip/Task Complete. Tanda invoice Mitra10 dibiarkan (menghapus kasus ≠ tanda salah).
create or replace function public.po_so_cases_delete(p_ids bigint[])
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not private.has_menu('rek.cekharga') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if cardinality(p_ids) > 5000 then
    raise exception 'Terlalu banyak PO (maks. 5000)' using errcode = '22023';
  end if;
  delete from public.po_so_cases where id = any(p_ids);
  get diagnostics v_count = row_count;
  return jsonb_build_object('deleted', v_count);
end;
$$;
revoke execute on function public.po_so_cases_delete(bigint[]) from public, anon;
grant execute on function public.po_so_cases_delete(bigint[]) to authenticated;

-- Arsip otomatis (Fase 83) + PO baru mewarisi tanda Mitra10 terbaru untuk PO yang sama.
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

  if cardinality(v_new) > 0 then
    update public.po_so_cases c set tanda = t.flag
    from (
      select distinct on (upper(trim(w.no_po))) upper(trim(w.no_po)) as po, f.flag
      from public.row_flags f join public.m10_worksheet w on w.id = f.worksheet_id
      where f.module = 'm10' and upper(trim(w.no_po)) = any(v_new)
      order by upper(trim(w.no_po)), f.updated_at desc
    ) t
    where c.po_customer = t.po and c.tanda is null;
  end if;
  return jsonb_build_object('inserted', to_jsonb(v_new));
end;
$$;

-- ══ RPC MITRA10: row_flags_set + sinkron ke PO ═════════════════════
create or replace function public.row_flags_set(p_module text, p_ids bigint[], p_flag text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_menu text;
  v_ids bigint[];
  v_found integer;
  v_count integer;
  v_pos text[] := '{}';
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

  -- Fase 84: PO dari baris ini yang ada di Cek Selisih Harga ikut berubah (+ invoice lain dengan PO sama).
  if p_module = 'm10' then
    select coalesce(array_agg(distinct c.po_customer), '{}') into v_pos
    from public.m10_worksheet w join public.po_so_cases c on c.po_customer = upper(trim(w.no_po))
    where w.id = any(v_ids);
    perform private.sync_po_tanda(v_pos, p_flag);
  end if;
  return jsonb_build_object('count', v_count, 'at', now(), 'synced_pos', cardinality(v_pos));
end;
$$;

-- ══ INVOICE MITRA10 BARU / PO BERUBAH → warisi tanda PO ═══════════
create or replace function private.m10_worksheet_po_tanda()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.row_flags (module, worksheet_id, flag, updated_by, updated_at)
    select 'm10', n.id, c.tanda, null, now()
    from new_rows n join public.po_so_cases c on c.po_customer = upper(trim(n.no_po))
    where c.tanda is not null
    on conflict (module, worksheet_id) do nothing;
  else
    insert into public.row_flags (module, worksheet_id, flag, updated_by, updated_at)
    select 'm10', n.id, c.tanda, null, now()
    from new_rows n
    join old_rows o on o.id = n.id and upper(trim(o.no_po)) is distinct from upper(trim(n.no_po))
    join public.po_so_cases c on c.po_customer = upper(trim(n.no_po))
    where c.tanda is not null
    on conflict (module, worksheet_id) do nothing;
  end if;
  return null;
end;
$$;
revoke execute on function private.m10_worksheet_po_tanda() from public, anon, authenticated;

create trigger m10_worksheet_po_tanda_ins after insert on public.m10_worksheet
  referencing new table as new_rows for each statement execute function private.m10_worksheet_po_tanda();
create trigger m10_worksheet_po_tanda_upd after update on public.m10_worksheet
  referencing old table as old_rows new table as new_rows for each statement execute function private.m10_worksheet_po_tanda();

-- ══ HAK AKSES ══════════════════════════════════════════════════════
-- Tanda hanya lewat RPC (agar sinkron tidak terlewati); tambah & hapus PO juga hanya lewat RPC.
revoke insert, update, delete, truncate on public.po_so_cases from anon, authenticated;
grant update (keterangan, status, completed_at) on public.po_so_cases to authenticated;

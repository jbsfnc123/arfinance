-- Fase 82 — tanda LTKP / Litigasi per baris Kertas Kerja (Mitra10; RKM disiapkan), lepas dari teks Keterangan.
-- Hanya MENAMBAH: satu tabel anotasi, RLS, trigger versi, dua RPC, dan pengisian awal dari Keterangan lama.
-- Tidak mengubah m10_worksheet, invoice_remarks (teks Keterangan tetap), nominal, maupun status lain.
-- Rollback: supabase/rollback/20261118120000_row_flags_down.sql.

-- ══ TABEL ══════════════════════════════════════════════════════════
-- Identitas = (modul, id worksheet) — sama dengan row_marks (id worksheet stabil). Normal = tidak ada baris.
create table public.row_flags (
  module       text not null check (module in ('m10', 'rkm')),
  worksheet_id bigint not null,
  flag         text not null check (flag in ('ltkp', 'litigasi')),
  updated_by   uuid default auth.uid(),
  updated_at   timestamptz not null default now(),
  primary key (module, worksheet_id)
);
comment on table public.row_flags is 'Tanda LTKP / Litigasi per baris Kertas Kerja (Mitra10/RKM). Anotasi manual; tanpa baris = Normal.';

-- ══ ATURAN AKSES ═══════════════════════════════════════════════════
alter table public.row_flags enable row level security;
create policy "baca tanda baris" on public.row_flags
  for select to authenticated using (
    (module = 'm10' and private.has_menu('rek.mitra10'))
    or (module = 'rkm' and private.has_menu('tukar.rkm'))
  );
revoke all on public.row_flags from anon;
revoke insert, update, delete, truncate, references, trigger on public.row_flags from authenticated;
grant select on public.row_flags to authenticated;

create trigger bump_version_row_flags after insert or update or delete or truncate on public.row_flags
  for each statement execute function private.bump_version('row_flags');
insert into public.data_versions (key, updated_at) values ('row_flags', now())
  on conflict (key) do nothing;

-- ══ RPC ════════════════════════════════════════════════════════════
create or replace function public.pack_row_flags(p_module text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_menu text;
begin
  v_menu := case p_module when 'm10' then 'rek.mitra10' when 'rkm' then 'tukar.rkm' end;
  if v_menu is null then
    raise exception 'Modul tidak dikenal' using errcode = '22023';
  end if;
  if not private.has_menu(v_menu) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return private.pack(format(
    'select f.worksheet_id as id, f.flag from public.row_flags f join public.%I w on w.id = f.worksheet_id
      where f.module = %L order by f.worksheet_id',
    case p_module when 'm10' then 'm10_worksheet' else 'rkm_worksheet' end, p_module),
    array['id', 'flag']);
end;
$$;

-- Set tanda (p_flag = 'ltkp' | 'litigasi') atau kembalikan ke Normal (p_flag = null) untuk sekumpulan baris.
-- Atomik: semua target harus ada di worksheet modul itu; bila ada yang tidak valid, tidak ada perubahan.
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
  if p_flag is not null and p_flag not in ('ltkp', 'litigasi') then
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

revoke execute on function public.pack_row_flags(text) from public, anon;
revoke execute on function public.row_flags_set(text, bigint[], text) from public, anon;
grant execute on function public.pack_row_flags(text) to authenticated;
grant execute on function public.row_flags_set(text, bigint[], text) to authenticated;

-- ══ PENGISIAN AWAL (sekali) ════════════════════════════════════════
-- Keterangan lama yang MENGANDUNG kata Litigasi → litigasi; selain itu yang mengandung LTKP → ltkp (keputusan user).
-- Teks Keterangan tidak diubah.
insert into public.row_flags (module, worksheet_id, flag, updated_by)
select distinct on (w.id) 'm10', w.id,
  case when r.keterangan ilike '%litigasi%' then 'litigasi' else 'ltkp' end, null::uuid
from public.m10_worksheet w
join public.invoice_remarks r on r.ref = private.remark_ref(w.no_sj, w.invoice_no)
where r.keterangan ilike '%litigasi%' or r.keterangan ilike '%ltkp%'
order by w.id
on conflict (module, worksheet_id) do nothing;

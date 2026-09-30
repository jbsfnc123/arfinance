-- 0040: Fase 44 — penanda warna baris (anotasi manual bersama) untuk Kertas Kerja Mitra10 & RKM.
-- Hanya MENAMBAH: satu tabel metadata, aturan akses (RLS), trigger versi pada tabel baru, dan dua fungsi RPC.
-- Tidak mengubah nominal, status, maupun struktur m10_worksheet / rkm_worksheet / tabel faktur lain.
-- Rollback: supabase/rollback/0040_row_marks_down.sql.

-- ══ TABEL METADATA ═════════════════════════════════════════════════
-- Identitas = (modul, id worksheet). id worksheet stabil: worksheet hanya ditambah saat No SJ baru muncul
-- (private.m10_append_from_aging / private.rkm_append_from_aging), tidak pernah dihapus/diganti. Modul memisahkan id serupa di
-- Mitra10 & RKM. Satu anotasi aktif per baris (primary key); tepat tiga nilai warna (check).
create table public.row_marks (
  module       text not null check (module in ('m10', 'rkm')),
  worksheet_id bigint not null,
  color        text not null check (color in ('blue', 'mint', 'lavender')),
  updated_by   uuid default auth.uid(),
  updated_at   timestamptz not null default now(),
  primary key (module, worksheet_id)
);
comment on table public.row_marks is 'Penanda warna baris Kertas Kerja (Mitra10/RKM). Anotasi manual, bukan data bisnis.';

-- ══ ATURAN AKSES ═══════════════════════════════════════════════════
-- Baca: hanya akun yang punya menu modul terkait. Tulis: hanya lewat RPC row_marks_set (tanpa policy tulis).
alter table public.row_marks enable row level security;
create policy "baca penanda warna baris" on public.row_marks
  for select to authenticated using (
    (module = 'm10' and private.has_menu('rek.mitra10'))
    or (module = 'rkm' and private.has_menu('tukar.rkm'))
  );
revoke all on public.row_marks from anon;
grant select on public.row_marks to authenticated;

-- Perubahan menaikkan token versi → browser pengguna lain memuat ulang penanda.
create trigger bump_version_row_marks after insert or update or delete or truncate on public.row_marks
  for each statement execute function private.bump_version('row_marks');
insert into public.data_versions (key, updated_at) values ('row_marks', now())
  on conflict (key) do nothing;

-- ══ RPC ════════════════════════════════════════════════════════════
-- Paket penanda satu modul (batch, bukan per baris). Hanya baris yang masih ada di worksheet modul itu.
create or replace function public.pack_row_marks(p_module text)
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
    'select m.worksheet_id as id, m.color from public.row_marks m join public.%I w on w.id = m.worksheet_id
      where m.module = %L order by m.worksheet_id',
    case p_module when 'm10' then 'm10_worksheet' else 'rkm_worksheet' end, p_module),
    array['id', 'color']);
end;
$$;

-- Set warna (p_color = 'blue' | 'mint' | 'lavender') atau hapus (p_color = null) untuk sekumpulan baris.
-- Atomik: semua target harus ada di worksheet modul itu; bila ada yang tidak valid, tidak ada perubahan.
create or replace function public.row_marks_set(p_module text, p_ids bigint[], p_color text)
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
  if p_color is not null and p_color not in ('blue', 'mint', 'lavender') then
    raise exception 'Warna tidak dikenal' using errcode = '22023';
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

  if p_color is null then
    delete from public.row_marks where module = p_module and worksheet_id = any(v_ids);
  else
    insert into public.row_marks (module, worksheet_id, color, updated_by, updated_at)
    select p_module, x, p_color, auth.uid(), now() from unnest(v_ids) x
    on conflict (module, worksheet_id) do update
      set color = excluded.color, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  end if;
  get diagnostics v_count = row_count;
  return jsonb_build_object('count', v_count, 'at', now());
end;
$$;

revoke execute on function public.pack_row_marks(text) from public, anon;
revoke execute on function public.row_marks_set(text, bigint[], text) from public, anon;
grant execute on function public.pack_row_marks(text) to authenticated;
grant execute on function public.row_marks_set(text, bigint[], text) to authenticated;

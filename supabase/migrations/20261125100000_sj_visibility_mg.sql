-- Fase 88 — Monitor Surat Jalan: centang Marketing Group di Setting (selain Business Partner & Area).
-- Hanya memperluas check constraint & validasi RPC; tidak ada data yang dihapus.
-- Rollback: supabase/rollback/20261125100000_sj_visibility_mg_down.sql.

alter table public.sj_visibility drop constraint sj_visibility_kind_check;
alter table public.sj_visibility add constraint sj_visibility_kind_check check (kind in ('bp', 'area', 'mg'));
comment on table public.sj_visibility is 'Monitor Surat Jalan (Fase 86/88): Business Partner / Area / Marketing Group yang disembunyikan (tidak dicentang) dari Dashboard & Kertas Kerja.';

create or replace function public.sj_visibility_set(p_kind text, p_values text[], p_hidden boolean)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not private.sj_can_manage() then
    raise exception 'Akses ditolak: pengaturan hanya untuk Controller/Super Admin' using errcode = '42501';
  end if;
  if p_kind not in ('bp', 'area', 'mg') or p_hidden is null then
    raise exception 'Data tidak valid' using errcode = '22023';
  end if;
  if cardinality(p_values) > 20000 then
    raise exception 'Terlalu banyak nilai (maks. 20.000)' using errcode = '22023';
  end if;
  insert into public.sj_visibility (kind, value, hidden, updated_by, updated_at)
  select distinct p_kind, v, p_hidden, auth.uid(), now()
  from unnest(coalesce(p_values, '{}')) v where nullif(trim(v), '') is not null
  on conflict (kind, value) do update
    set hidden = excluded.hidden, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  get diagnostics v_count = row_count;
  return jsonb_build_object('count', v_count);
end;
$$;

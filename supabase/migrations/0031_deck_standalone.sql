-- 0031: Fase 24 — Presentasi AR berdiri sendiri. Tidak terhubung dengan menu/upload lain; data per bulan
-- berasal dari template Excel (1 slide = 1 sheet) dan disimpan sebagai 1 JSON terkompresi (gzip, base64) per bulan.
-- Data presentasi lama (riwayat Excel, snapshot, agregat mentah) dihapus sesuai keputusan user (mulai dari kosong).

-- ── Putuskan upload inti dari Presentasi: buang penandaan deck_dirty ──
do $$
declare f text; v_def text; v_new text;
begin
  foreach f in array array['public.aging_commit(uuid)', 'public.erp_commit(uuid)', 'public.bp_commit(uuid)'] loop
    select pg_get_functiondef(f::regprocedure) into v_def;
    v_new := regexp_replace(v_def, 'insert into public\.deck_dirty[^;]*;', '-- (Presentasi AR tidak lagi memakai data upload — Fase 24)', 'g');
    if v_new = v_def then raise exception '%: pernyataan deck_dirty tidak ditemukan', f; end if;
    execute v_new;
  end loop;
end $$;

-- ── Hapus struktur presentasi lama ──
drop function if exists public.deck_save(jsonb, jsonb, jsonb, jsonb);
drop function if exists public.deck_close_month(text, jsonb);
drop function if exists public.deck_close_until(text);
drop function if exists public.deck_reopen_month(text);
drop function if exists private.deck_closed(text);
drop view if exists public.v_deck_invoices;
drop view if exists public.v_deck_payments;
drop table if exists public.deck_metrics, public.deck_periods, public.deck_bp_snapshot, public.deck_manual_rows,
  public.deck_texts, public.deck_derived, public.deck_dirty;

-- deck_state tinggal konfigurasi tampilan (bulan laporan, minggu W).
update public.deck_state set state = jsonb_build_object('version', 3, 'config', coalesce(state->'config', '{}')) where id = 1;

-- ── Data presentasi per bulan ──
create table public.deck_months (
  month         text primary key check (month ~ '^\d{4}-\d{2}$'),
  data          text not null,                 -- JSON {v, series, tables, texts, sheets} → gzip → base64
  sheets_filled integer not null default 0,
  sheets_total  integer not null default 0,
  complete      boolean not null default false,
  file_name     text,
  uploaded_at   timestamptz,
  uploaded_by   uuid references public.profiles(id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles(id) on delete set null
);
create index deck_months_uploaded_by_idx on public.deck_months (uploaded_by);
create index deck_months_updated_by_idx on public.deck_months (updated_by);

alter table public.deck_months enable row level security;
create policy "baca deck_months" on public.deck_months for select to authenticated using (private.has_menu('lap.presentasi'));
grant select on public.deck_months to authenticated;
create trigger bump_version_deck_months after insert or update or delete or truncate on public.deck_months
  for each statement execute function private.bump_version('deck');

-- Simpan satu bulan. p_upload = true: hasil upload template (catat file & pengunggah); false: hanya teks slide.
create or replace function public.deck_month_save(p_month text, p_data text, p_filled integer, p_total integer,
  p_file text default null, p_upload boolean default true)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.has_menu('lap.presentasi') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if p_month !~ '^\d{4}-\d{2}$' then raise exception 'Bulan tidak valid' using errcode = '22023'; end if;
  if coalesce(p_data, '') = '' or length(p_data) > 5000000 then raise exception 'Data tidak valid' using errcode = '22023'; end if;
  insert into public.deck_months (month, data, sheets_filled, sheets_total, complete, file_name, uploaded_at, uploaded_by, updated_at, updated_by)
  values (p_month, p_data, p_filled, p_total, p_total > 0 and p_filled >= p_total, p_file,
          case when p_upload then now() end, case when p_upload then (select auth.uid()) end, now(), (select auth.uid()))
  on conflict (month) do update set
    data = excluded.data,
    sheets_filled = case when p_upload then excluded.sheets_filled else deck_months.sheets_filled end,
    sheets_total = case when p_upload then excluded.sheets_total else deck_months.sheets_total end,
    complete = case when p_upload then excluded.complete else deck_months.complete end,
    file_name = case when p_upload then excluded.file_name else deck_months.file_name end,
    uploaded_at = case when p_upload then excluded.uploaded_at else deck_months.uploaded_at end,
    uploaded_by = case when p_upload then excluded.uploaded_by else deck_months.uploaded_by end,
    updated_at = now(), updated_by = (select auth.uid());
end;
$$;

create or replace function public.deck_month_delete(p_month text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.is_ctrl() then
    raise exception 'Hanya Controller / Super Admin yang dapat menghapus data bulan' using errcode = '42501';
  end if;
  delete from public.deck_months where month = p_month;
end;
$$;

revoke execute on function public.deck_month_save(text, text, integer, integer, text, boolean) from public, anon;
revoke execute on function public.deck_month_delete(text) from public, anon;
grant execute on function public.deck_month_save(text, text, integer, integer, text, boolean) to authenticated;
grant execute on function public.deck_month_delete(text) to authenticated;

-- 0030: Fase 23 — Presentasi AR: data per bulan di tabel (bukan satu JSON), bulan tertutup = snapshot statis.
--
--   deck_periods      status bulan (open/closed)
--   deck_metrics      angka seri per bulan, format panjang; source: excel | raw | auto | manual
--                     (prioritas baca: manual > raw/auto > excel — sama dengan app lama)
--   deck_bp_snapshot  rincian per BP bulan tertutup (invoice/aging/payment/bpmaster), beku
--   deck_manual_rows  8 tabel manual per bulan
--   deck_texts        teks slide & catatan per bulan
--   deck_state        kini hanya konfigurasi (bulan laporan, minggu W), label seri, riwayat impor

create table public.deck_periods (
  month        text primary key check (month ~ '^\d{4}-\d{2}$'),
  status       text not null default 'open' check (status in ('open', 'closed')),
  closed_at    timestamptz,
  closed_by    uuid references public.profiles(id) on delete set null,
  reopened_at  timestamptz,
  reopened_by  uuid references public.profiles(id) on delete set null,
  note         text
);

create table public.deck_metrics (
  month      text not null check (month ~ '^\d{4}-\d{2}$'),
  key        text not null,
  source     text not null check (source in ('excel', 'raw', 'auto', 'manual')),
  value      numeric not null,
  label      text,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  primary key (month, key, source)
);

create table public.deck_bp_snapshot (
  month       text not null check (month ~ '^\d{4}-\d{2}$'),
  kind        text not null check (kind in ('invoice', 'payment', 'aging', 'bpmaster')),
  bp          jsonb not null default '[]'::jsonb,
  stats       jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  primary key (month, kind)
);

create table public.deck_manual_rows (
  id         bigint generated always as identity primary key,
  month      text not null check (month ~ '^\d{4}-\d{2}$'),
  table_name text not null check (table_name in ('AR Historis', 'Top Unpaid W', 'Uncollected', 'Unallocated',
               'Due90 Summary', 'Due90 Cicil', 'Bad Debt Summary', 'Bad Debt Detail')),
  sort       integer not null default 0,
  row        jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null
);
create index deck_manual_rows_month_idx on public.deck_manual_rows (month, table_name, sort);

create table public.deck_texts (
  month      text not null check (month ~ '^\d{4}-\d{2}$'),
  slide_key  text not null,
  text       text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  primary key (month, slide_key)
);

create index deck_periods_closed_by_idx on public.deck_periods (closed_by);
create index deck_periods_reopened_by_idx on public.deck_periods (reopened_by);
create index deck_metrics_updated_by_idx on public.deck_metrics (updated_by);
create index deck_manual_rows_updated_by_idx on public.deck_manual_rows (updated_by);
create index deck_texts_updated_by_idx on public.deck_texts (updated_by);

do $$
declare t text;
begin
  foreach t in array array['deck_periods', 'deck_metrics', 'deck_bp_snapshot', 'deck_manual_rows', 'deck_texts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "baca %s" on public.%I for select to authenticated using (private.has_menu(''lap.presentasi''))', t, t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create trigger bump_version_%s after insert or update or delete or truncate on public.%I
                    for each statement execute function private.bump_version(''deck'')', t, t);
  end loop;
end $$;

-- ── Bulan tertutup ──────────────────────────────────────────────
create or replace function private.deck_closed(p_month text)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.deck_periods where month = p_month and status = 'closed') $$;
revoke execute on function private.deck_closed(text) from public, anon, authenticated;

-- Simpan perubahan input presentasi (manual, excel, tabel manual, teks). Bulan tertutup ditolak.
--   p_metrics: [{month,key,source,value,label}]  (source hanya 'manual' / 'excel')
--   p_metric_deletes: [{month,key,source}]
--   p_rows: [{month,table_name,rows:[...]}]      (mengganti isi tabel itu untuk bulan itu)
--   p_texts: [{month,slide_key,text}]             (text kosong = hapus)
create or replace function public.deck_save(p_metrics jsonb, p_metric_deletes jsonb, p_rows jsonb, p_texts jsonb)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_closed text; v_n integer := 0; v_c integer;
begin
  if not private.has_menu('lap.presentasi') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  select string_agg(distinct m, ', ' order by m) into v_closed from (
    select x->>'month' m from jsonb_array_elements(coalesce(p_metrics, '[]')) x
    union select x->>'month' from jsonb_array_elements(coalesce(p_metric_deletes, '[]')) x
    union select x->>'month' from jsonb_array_elements(coalesce(p_rows, '[]')) x
    union select x->>'month' from jsonb_array_elements(coalesce(p_texts, '[]')) x) s
  where private.deck_closed(m);
  if v_closed is not null then
    raise exception 'Bulan sudah ditutup (snapshot statis): %. Buka kembali bulan tersebut untuk mengubah.', v_closed using errcode = '42501';
  end if;

  delete from public.deck_metrics d using jsonb_array_elements(coalesce(p_metric_deletes, '[]')) x
  where d.month = x->>'month' and d.key = x->>'key' and d.source = x->>'source' and d.source in ('manual', 'excel');
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  insert into public.deck_metrics (month, key, source, value, label, updated_at, updated_by)
  select x->>'month', x->>'key', x->>'source', (x->>'value')::numeric, x->>'label', now(), (select auth.uid())
  from jsonb_array_elements(coalesce(p_metrics, '[]')) x
  where x->>'source' in ('manual', 'excel') and x->>'value' is not null
  on conflict (month, key, source) do update set value = excluded.value, label = coalesce(excluded.label, deck_metrics.label),
    updated_at = now(), updated_by = excluded.updated_by;
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  delete from public.deck_manual_rows r using jsonb_array_elements(coalesce(p_rows, '[]')) x
  where r.month = x->>'month' and r.table_name = x->>'table_name';
  insert into public.deck_manual_rows (month, table_name, sort, row)
  select x->>'month', x->>'table_name', e.ord::integer, e.val
  from jsonb_array_elements(coalesce(p_rows, '[]')) x, jsonb_array_elements(x->'rows') with ordinality e(val, ord);
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  delete from public.deck_texts t using jsonb_array_elements(coalesce(p_texts, '[]')) x
  where t.month = x->>'month' and t.slide_key = x->>'slide_key' and coalesce(x->>'text', '') = '';
  insert into public.deck_texts (month, slide_key, text, updated_at, updated_by)
  select x->>'month', x->>'slide_key', x->>'text', now(), (select auth.uid())
  from jsonb_array_elements(coalesce(p_texts, '[]')) x where coalesce(x->>'text', '') <> ''
  on conflict (month, slide_key) do update set text = excluded.text, updated_at = now(), updated_by = excluded.updated_by;
  get diagnostics v_c = row_count; v_n := v_n + v_c;
  return v_n;
end;
$$;

-- Tutup bulan: salin agregat mentah terkini (deck_derived) + master BP saat ini menjadi snapshot beku,
-- simpan seri 'auto' (Collection dari Target & ERP, dihitung di browser), lalu kunci bulan.
create or replace function public.deck_close_month(p_month text, p_auto jsonb default '[]'::jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_raw integer; v_bp integer;
begin
  if not private.is_ctrl() then
    raise exception 'Hanya Controller / Super Admin yang dapat menutup bulan' using errcode = '42501';
  end if;
  if p_month !~ '^\d{4}-\d{2}$' then raise exception 'Bulan tidak valid' using errcode = '22023'; end if;
  if private.deck_closed(p_month) then raise exception 'Bulan % sudah ditutup', p_month using errcode = '22023'; end if;
  if exists (select 1 from public.deck_dirty where month in (p_month, '-')) then
    raise exception 'Data bulan % masih dihitung ulang. Buka Presentasi AR sekali lagi, lalu tutup bulan.', p_month using errcode = '55000';
  end if;

  delete from public.deck_metrics where month = p_month and source in ('raw', 'auto');
  insert into public.deck_metrics (month, key, source, value, updated_by)
  select p_month, s.key, 'raw', (m.value #>> '{}')::numeric, (select auth.uid())
  from public.deck_derived d, jsonb_each(d.series) s, jsonb_each(s.value) m
  where d.kind in ('invoice', 'payment', 'aging') and m.key = p_month and jsonb_typeof(m.value) = 'number'
  on conflict (month, key, source) do update set value = excluded.value, updated_at = now();
  get diagnostics v_raw = row_count;

  insert into public.deck_metrics (month, key, source, value, updated_by)
  select p_month, x->>'key', 'auto', (x->>'value')::numeric, (select auth.uid())
  from jsonb_array_elements(coalesce(p_auto, '[]')) x where x->>'value' is not null
  on conflict (month, key, source) do update set value = excluded.value, updated_at = now();

  delete from public.deck_bp_snapshot where month = p_month;
  insert into public.deck_bp_snapshot (month, kind, bp, stats)
  select p_month, d.kind, d.bp, d.stats from public.deck_derived d
  where (d.kind in ('invoice', 'payment', 'aging') and d.month = p_month) or (d.kind = 'bpmaster' and d.month = '-');
  get diagnostics v_bp = row_count;

  insert into public.deck_periods (month, status, closed_at, closed_by)
  values (p_month, 'closed', now(), (select auth.uid()))
  on conflict (month) do update set status = 'closed', closed_at = now(), closed_by = (select auth.uid());
  return jsonb_build_object('month', p_month, 'raw', v_raw, 'bp', v_bp);
end;
$$;

-- Tutup banyak bulan riwayat sekaligus (tanpa data mentah; mis. bulan yang hanya berisi riwayat Excel).
create or replace function public.deck_close_until(p_until text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_n integer;
begin
  if not private.is_ctrl() then
    raise exception 'Hanya Controller / Super Admin yang dapat menutup bulan' using errcode = '42501';
  end if;
  insert into public.deck_periods (month, status, closed_at, closed_by)
  select distinct m.month, 'closed', now(), (select auth.uid()) from public.deck_metrics m
  where m.month <= p_until and not private.deck_closed(m.month)
    and not exists (select 1 from public.deck_derived d where d.month = m.month)  -- bulan dengan data mentah: pakai deck_close_month
  on conflict (month) do update set status = 'closed', closed_at = now(), closed_by = (select auth.uid());
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.deck_reopen_month(p_month text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.is_sa() then
    raise exception 'Hanya Super Admin yang dapat membuka kembali bulan' using errcode = '42501';
  end if;
  update public.deck_periods set status = 'open', reopened_at = now(), reopened_by = (select auth.uid()) where month = p_month;
  -- Bulan dibuka lagi → dihitung ulang dari data mentah saat Presentasi dibuka.
  insert into public.deck_dirty (kind, month) select k, p_month from unnest(array['invoice', 'payment', 'aging']) k
  on conflict (kind, month) do update set at = now();
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.deck_save(jsonb, jsonb, jsonb, jsonb)', 'public.deck_close_month(text, jsonb)',
    'public.deck_close_until(text)', 'public.deck_reopen_month(text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ── Pindahkan isi JSON lama deck_state ke tabel baru ────────────
do $$
declare st jsonb;
begin
  select state into st from public.deck_state where id = 1;
  if st is null then return; end if;

  insert into public.deck_metrics (month, key, source, value, label, updated_by)
  select m.key, s.key, l.src, (m.value #>> '{}')::numeric, st->'labels'->>s.key, null
  from (values ('manual'), ('excel')) l(src),
       jsonb_each(coalesce(st->'layers'->l.src, '{}')) s, jsonb_each(s.value) m
  where jsonb_typeof(m.value) = 'number' and m.key ~ '^\d{4}-\d{2}$'
  on conflict do nothing;

  insert into public.deck_manual_rows (month, table_name, sort, row)
  select r.value->>'Bulan', t.key, r.ord::integer, r.value
  from jsonb_each(coalesce(st->'manual', '{}')) t, jsonb_array_elements(t.value) with ordinality r(value, ord)
  where (r.value->>'Bulan') ~ '^\d{4}-\d{2}$'
    and t.key in ('AR Historis', 'Top Unpaid W', 'Uncollected', 'Unallocated', 'Due90 Summary', 'Due90 Cicil', 'Bad Debt Summary', 'Bad Debt Detail');

  insert into public.deck_texts (month, slide_key, text)
  select m.key, k.key, k.value #>> '{}'
  from jsonb_each(coalesce(st->'texts', '{}')) m, jsonb_each(m.value) k
  where m.key ~ '^\d{4}-\d{2}$' and coalesce(k.value #>> '{}', '') <> ''
  on conflict do nothing;

  -- deck_state kini hanya konfigurasi + label + riwayat impor.
  update public.deck_state set state = jsonb_build_object(
    'version', st->'version', 'config', coalesce(st->'config', '{}'), 'labels', coalesce(st->'labels', '{}'),
    'imports', coalesce(st->'imports', '[]'))
  where id = 1;
end $$;

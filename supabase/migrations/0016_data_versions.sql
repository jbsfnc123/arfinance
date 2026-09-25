-- 0016: Fase 8 — token versi data untuk cache browser + pengecualian manual transaksi Mutasi.

-- ══ TOKEN VERSI PER DATASET ══════════════════════════════════════
-- Setiap perubahan tabel sumber menaikkan data_versions[key].updated_at. Browser menyimpan
-- data di IndexedDB bersama token ini dan hanya memuat ulang bila token berubah.
create or replace function private.bump_version()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.data_versions (key, updated_at) values (tg_argv[0], now())
  on conflict (key) do update set updated_at = excluded.updated_at;
  return null;
end;
$$;

-- ══ PENGECUALIAN MANUAL TRANSAKSI MUTASI ═════════════════════════
-- Tabel terpisah dengan kunci alami, karena mutasi_import menghapus & memasukkan ulang baris
-- per tanggal saat file di-upload ulang — tanda tetap berlaku setelah upload ulang.
create table public.bank_mutation_exclusions (
  id         bigint generated always as identity primary key,
  account    text not null,
  tx_date    date not null,
  amount     numeric(18,2) not null,
  keterangan text not null default '',
  catatan    text not null default '',
  note       text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (account, tx_date, amount, keterangan, catatan)
);
create index bank_mutation_exclusions_created_by_idx on public.bank_mutation_exclusions (created_by);
alter table public.bank_mutation_exclusions enable row level security;
create policy "baca pengecualian mutasi" on public.bank_mutation_exclusions
  for select to authenticated using (private.has_menu('rek.mutasi'));

create view public.v_bank_mutations with (security_invoker = true) as
select m.*, (x.id is not null) as excluded, x.note as excluded_note
from public.bank_mutations m
left join public.bank_mutation_exclusions x
  on x.account = m.account and x.tx_date = m.tx_date and x.amount = m.amount
 and x.keterangan = coalesce(m.keterangan, '') and x.catatan = coalesce(m.catatan, '');

create or replace function public.mutasi_set_excluded(p_ids bigint[], p_excluded boolean, p_note text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not private.has_menu('rek.mutasi') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if p_excluded then
    insert into public.bank_mutation_exclusions (account, tx_date, amount, keterangan, catatan, note)
    select account, tx_date, amount, coalesce(keterangan, ''), coalesce(catatan, ''), nullif(trim(p_note), '')
    from public.bank_mutations where id = any(p_ids)
    on conflict (account, tx_date, amount, keterangan, catatan) do update set note = excluded.note;
  else
    delete from public.bank_mutation_exclusions x using public.bank_mutations m
    where m.id = any(p_ids) and x.account = m.account and x.tx_date = m.tx_date and x.amount = m.amount
      and x.keterangan = coalesce(m.keterangan, '') and x.catatan = coalesce(m.catatan, '');
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.mutasi_set_excluded(bigint[], boolean, text) from public, anon;
grant execute on function public.mutasi_set_excluded(bigint[], boolean, text) to authenticated;

-- Dashboard: uang masuk hanya dari baris yang TIDAK dikecualikan; nominal pengecualian dilaporkan terpisah.
create or replace function public.mutasi_dashboard(p_month text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_start date; v_end date; v_res jsonb;
begin
  if not private.has_menu('rek.mutasi') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if p_month !~ '^\d{4}-\d{2}$' then
    raise exception 'Format bulan harus YYYY-MM' using errcode = '22023';
  end if;
  v_start := (p_month || '-01')::date;
  v_end := (v_start + interval '1 month' - interval '1 day')::date;

  with days as (
    select generate_series(v_start, v_end, interval '1 day')::date as d
  ), rows_m as (
    select account, tx_date, amount, excluded from public.v_bank_mutations
    where tx_date between v_start and v_end
  ), mut as (
    select tx_date as d, jsonb_object_agg(account, amt) as per_account
    from (select account, tx_date, sum(amount) as amt from rows_m where not excluded group by 1, 2) x
    group by tx_date
  ), exc as (
    select tx_date as d, sum(amount) as amt, count(*) as n from rows_m where excluded group by 1
  ), pay as (
    select p.payment_date as d, sum(p.amount) as alloc,
           coalesce(sum(p.amount) filter (where t.invoice_no is not null), 0) as alloc_t
    from public.erp_payments p
    left join public.ar_targets t on t.month = p_month and t.invoice_no = p.invoice_no
    where p.payment_date between v_start and v_end
    group by 1
  ), inv as (
    select invoice_date as d, sum(amount) as amt from public.erp_invoices
    where invoice_date between v_start and v_end group by 1
  )
  select jsonb_build_object(
    'accounts', (select coalesce(jsonb_agg(code order by sort, code), '[]') from public.bank_accounts
                 where active or exists (select 1 from public.bank_mutations m
                                         where m.account = code and m.tx_date between v_start and v_end)),
    'target', (select coalesce(sum(target), 0) from public.ar_targets where month = p_month),
    'targetCount', (select count(*) from public.ar_targets where month = p_month),
    'days', (select jsonb_agg(jsonb_build_object(
               'date', days.d,
               'mut', coalesce(mut.per_account, '{}'::jsonb),
               'alloc', coalesce(pay.alloc, 0),
               'allocT', coalesce(pay.alloc_t, 0),
               'inv', coalesce(inv.amt, 0),
               'exc', coalesce(exc.amt, 0),
               'excN', coalesce(exc.n, 0)) order by days.d)
             from days
             left join mut on mut.d = days.d
             left join exc on exc.d = days.d
             left join pay on pay.d = days.d
             left join inv on inv.d = days.d),
    'months', (select jsonb_agg(m order by m desc) from (
                 select to_char(tx_date, 'YYYY-MM') as m from public.bank_mutations
                 union select to_char(invoice_date, 'YYYY-MM') from public.erp_invoices
                 union select to_char(payment_date, 'YYYY-MM') from public.erp_payments
                 union select month from public.ar_targets
                 union select to_char((now() at time zone 'Asia/Jakarta')::date, 'YYYY-MM')) x)
  ) into v_res;
  return v_res;
end;
$$;

-- ── Pemicu versi (statement-level: 1× per perintah, bukan per baris) ──
do $$
declare r record;
begin
  for r in select * from (values
    ('ar_aging_snapshots', 'aging'), ('ar_aging_lines', 'aging'),
    ('erp_invoices', 'erp'), ('erp_payments', 'erp'), ('business_partners', 'erp'),
    ('ar_targets', 'targets'),
    ('notes', 'activity'), ('payment_promises', 'activity'), ('invoice_exchanges', 'activity'), ('contacts', 'activity'),
    ('bank_mutations', 'mutasi'), ('bank_accounts', 'mutasi'), ('bank_mutation_exclusions', 'mutasi'),
    ('m10_worksheet', 'm10'), ('m10_gr', 'm10'), ('m10_kwitansi', 'm10'), ('m10_payment_schedule', 'm10'), ('m10_bp_users', 'm10'),
    ('app_settings', 'settings'),
    ('deck_state', 'deck'), ('deck_derived', 'deck'), ('deck_dirty', 'deck'),
    ('courier_schedules', 'tukar'), ('courier_updates', 'tukar'),
    ('tax_invoice_requests', 'faktur'), ('tax_invoice_holds', 'faktur'), ('ltkp_documents', 'faktur'),
    ('so_master', 'cekharga'), ('po_so_cases', 'cekharga')
  ) as t(tbl, k) loop
    execute format('create trigger bump_version_%1$s after insert or update or delete or truncate on public.%1$I
                    for each statement execute function private.bump_version(%2$L)', r.tbl, r.k);
  end loop;
end;
$$;

insert into public.data_versions (key, updated_at)
select k, now() from unnest(array['aging','erp','targets','activity','mutasi','m10','settings','deck','tukar','faktur','cekharga']) k
on conflict (key) do nothing;

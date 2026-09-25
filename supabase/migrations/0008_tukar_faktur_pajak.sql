-- 0008: Fase 2 — Tukar Faktur (jadwal & aplikasi kurir) dan Faktur Pajak
-- (pengajuan pembatalan/revisi, hold, dokumen LTKP).
-- Pengganti spreadsheet GAS "Tukar Faktur" (sheet Jadwal, Update, Kurir) dan
-- "Pembatalan dan Revisi Faktur" (sheet Invoice, Pengajuan, Hold Faktur).

-- ── Penanda pembuat (nama tampilan) ──────────────────────────────
create or replace function private.stamp_creator()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.created_by := (select auth.uid());
  new.created_by_name := (select display_name from public.profiles where id = (select auth.uid()));
  return new;
end;
$$;
revoke execute on function private.stamp_creator() from public, anon, authenticated;

create or replace function private.my_name()
returns text
language sql stable security definer set search_path = ''
as $$
  select display_name from public.profiles where id = (select auth.uid());
$$;
revoke execute on function private.my_name() from public, anon;
grant execute on function private.my_name() to authenticated;

-- ══ TUKAR FAKTUR ═════════════════════════════════════════════════
-- Jadwal kirim (pengganti sheet Jadwal; diganti penuh setiap upload).
create table public.courier_schedules (
  invoice_no       text primary key,
  payment_group    text,
  marketing        text,
  business_partner text,
  invoice_date     date,
  open_amt         numeric(18,2) not null default 0,
  send_date        date not null,
  uploaded_at      timestamptz not null default now()
);
create index courier_schedules_send_date_idx on public.courier_schedules (send_date);

-- Hasil kunjungan kurir (pengganti sheet Update). Invoice yang sudah punya baris di
-- sini (Done maupun Pending) tidak muncul lagi di daftar kurir, sama seperti versi lama.
create table public.courier_updates (
  id               bigint generated always as identity primary key,
  invoice_no       text not null,
  business_partner text,
  invoice_date     date,
  open_amt         numeric(18,2) not null default 0,
  tanggal_tukar    date not null,
  status           text not null check (status in ('Done', 'Pending')),
  keterangan       text,
  kode             text,
  foto_path        text,
  kurir            text not null,
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid()
);
create index courier_updates_invoice_idx on public.courier_updates (invoice_no);
create index courier_updates_tanggal_idx on public.courier_updates (tanggal_tukar) where status = 'Done';

create or replace function private.can_see_tukar()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_ctrl() or private.my_kind() = 'kurir'
      or private.has_menu('tukar.detail') or private.has_menu('tukar.jadwal')
      or private.has_menu('tukar.upload') or private.has_menu('dash.tukar');
$$;
revoke execute on function private.can_see_tukar() from public, anon;
grant execute on function private.can_see_tukar() to authenticated;

alter table public.courier_schedules enable row level security;
alter table public.courier_updates   enable row level security;
create policy "baca jadwal kurir" on public.courier_schedules
  for select to authenticated using (private.can_see_tukar());
create policy "baca hasil kurir" on public.courier_updates
  for select to authenticated using (private.can_see_tukar());

-- Upload jadwal. Payment Group / Marketing / Open Amt yang kosong diambil dari ar_invoices
-- (dulu dari file "Data 2 Aging", yang isinya sama dengan Blank_A4).
create or replace function public.schedule_replace(p_rows jsonb, p_file_name text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not (private.is_ctrl() and private.has_menu('tukar.upload')) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;

  delete from public.courier_schedules where true;
  insert into public.courier_schedules
    (invoice_no, payment_group, marketing, business_partner, invoice_date, open_amt, send_date)
  select distinct on (r.invoice_no)
    r.invoice_no,
    coalesce(nullif(trim(r.payment_group), ''), a.payment_group, 'Tanpa Grup'),
    coalesce(nullif(trim(r.marketing), ''), a.marketing, '-'),
    r.business_partner,
    r.invoice_date,
    coalesce(r.open_amt, a.open_amt, 0),
    r.send_date
  from jsonb_to_recordset(p_rows) as r(
    invoice_no text, payment_group text, marketing text, business_partner text,
    invoice_date date, open_amt numeric, send_date date)
  left join public.ar_invoices a on a.invoice_no = r.invoice_no
  where nullif(trim(r.invoice_no), '') is not null and r.send_date is not null
  order by r.invoice_no;
  get diagnostics v_count = row_count;

  insert into public.import_log (module, kind, file_name, rows, user_id)
  values ('tukar_faktur', 'jadwal', p_file_name, v_count, (select auth.uid()));
  return v_count;
end;
$$;

-- Tanggal kirim yang masih punya invoice belum dikunjungi (dropdown aplikasi kurir).
create or replace function public.courier_dates()
returns table (send_date date, invoices bigint)
language sql stable security invoker set search_path = ''
as $$
  select s.send_date, count(*)
  from public.courier_schedules s
  where not exists (select 1 from public.courier_updates u where u.invoice_no = s.invoice_no)
  group by s.send_date
  order by s.send_date;
$$;

-- Daftar nama kurir (akun role jenis kurir) untuk dipilih controller.
create or replace function public.courier_names()
returns table (name text)
language sql stable security definer set search_path = ''
as $$
  select p.display_name from public.profiles p
  join public.roles r on r.id = p.role_id
  where r.kind = 'kurir' and p.active and private.can_see_tukar()
  order by 1;
$$;

-- Simpan hasil kunjungan. Invoice Done juga dicatat sebagai tukar faktur metode Kolektor
-- (tampil di halaman Collection) — pengganti sinkron manual sheet "Tukar Faktur".
create or replace function public.courier_submit(
  p_invoices jsonb,            -- [{invoice_no, done: bool}]
  p_tanggal date,
  p_ket_done text,
  p_ket_pending text,
  p_foto_path text,
  p_kurir text
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_kind  text := private.my_kind();
  v_kurir text;
  v_kode  text;
  v_count integer;
  v_done  integer;
begin
  if not (v_kind in ('sa', 'ctrl', 'kurir') and private.has_menu('tukar.detail')) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if p_tanggal is null then
    raise exception 'Tanggal diterima wajib diisi' using errcode = '22023';
  end if;
  -- Kurir selalu tercatat atas namanya sendiri.
  v_kurir := case when v_kind = 'kurir' then private.my_name() else nullif(trim(p_kurir), '') end;
  if v_kurir is null then
    raise exception 'Nama kurir wajib diisi' using errcode = '22023';
  end if;

  create temp table _sel on commit drop as
  select s.*, coalesce(x.done, false) as done
  from jsonb_to_recordset(p_invoices) as x(invoice_no text, done boolean)
  join public.courier_schedules s on s.invoice_no = x.invoice_no
  where not exists (select 1 from public.courier_updates u where u.invoice_no = s.invoice_no);

  select count(*), count(*) filter (where done) into v_count, v_done from _sel;
  if v_count = 0 then
    raise exception 'Invoice sudah diproses atau tidak ada di jadwal' using errcode = '22023';
  end if;
  if v_done > 0 and nullif(trim(p_foto_path), '') is null then
    raise exception 'Foto tanda terima wajib untuk invoice Done' using errcode = '22023';
  end if;

  v_kode := case when v_done > 0 then to_char(now() at time zone 'Asia/Jakarta', 'DD-MM-YY-HH24MISS') end;

  insert into public.courier_updates
    (invoice_no, business_partner, invoice_date, open_amt, tanggal_tukar, status, keterangan, kode, foto_path, kurir)
  select invoice_no, business_partner, invoice_date, open_amt, p_tanggal,
         case when done then 'Done' else 'Pending' end,
         nullif(trim(case when done then p_ket_done else p_ket_pending end), ''),
         case when done then v_kode end,
         case when done then p_foto_path end,
         v_kurir
  from _sel;

  insert into public.invoice_exchanges
    (invoice_no, metode, tanggal, keterangan, foto_path, kurir, collection_name)
  select s.invoice_no, 'Kolektor', p_tanggal, v_kode, p_foto_path, v_kurir, a.collection_name
  from _sel s left join public.ar_invoices a on a.invoice_no = s.invoice_no
  where s.done;

  return jsonb_build_object('count', v_count, 'done', v_done, 'kode', v_kode, 'kurir', v_kurir);
end;
$$;

-- Dashboard tukar faktur: kalender penuh satu bulan (hanya status Done).
create or replace function public.tukar_dashboard(p_month text, p_kurir text)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with done as (
    select tanggal_tukar as d,
           coalesce(nullif(trim(kurir), ''), 'Tanpa Kolektor') as kol,
           nullif(trim(business_partner), '') as bp,
           nullif(trim(kode), '') as kode
    from public.courier_updates where status = 'Done'
  ),
  sel as (
    select * from done
    where to_char(d, 'YYYY-MM') = p_month and (coalesce(p_kurir, '') = '' or kol = p_kurir)
  ),
  days as (
    select generate_series(to_date(p_month || '-01', 'YYYY-MM-DD'),
                           (to_date(p_month || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date,
                           interval '1 day')::date as day
    where p_month ~ '^\d{4}-\d{2}$'
  ),
  daily as (
    select days.day, count(sel.d) as inv, count(distinct sel.bp) as bp, count(distinct sel.kode) as lok
    from days left join sel on sel.d = days.day
    group by days.day
  )
  select jsonb_build_object(
    'months', coalesce((select jsonb_agg(m order by m desc) from (select distinct to_char(d, 'YYYY-MM') m from done) x), '[]'::jsonb),
    'kurirs', coalesce((select jsonb_agg(kol order by kol) from (select distinct kol from done) y), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', extract(day from day)::int, 'inv', inv, 'bp', bp, 'lok', lok) order by day) from daily), '[]'::jsonb)
  );
$$;

-- Jadwal Kolektor (menu tukar.jadwal): tanggal kirim yang ada di jadwal.
create or replace function public.jadwal_dates()
returns table (send_date date)
language sql stable security invoker set search_path = ''
as $$
  select distinct send_date from public.courier_schedules order by 1;
$$;

-- Invoice satu tanggal kirim + status tukar faktur oleh kolektor.
create or replace function public.jadwal_kolektor(p_date date)
returns table (business_partner text, invoice_no text, invoice_date date, tukar boolean, kolektor text)
language sql stable security invoker set search_path = ''
as $$
  select s.business_partner, s.invoice_no, s.invoice_date,
         u.invoice_no is not null, u.kurir
  from public.courier_schedules s
  left join lateral (
    select invoice_no, kurir from public.courier_updates
    where invoice_no = s.invoice_no and status = 'Done' order by id limit 1
  ) u on true
  where s.send_date = p_date;
$$;

-- Tukar faktur 5 hari terakhir (per tanggal & kolektor).
create or replace function public.recent_tukar()
returns table (tanggal date, kolektor text, lokasi bigint, invoices bigint)
language sql stable security invoker set search_path = ''
as $$
  with days as (
    select distinct tanggal_tukar from public.courier_updates
    where status = 'Done' order by tanggal_tukar desc limit 5
  )
  select u.tanggal_tukar, coalesce(nullif(trim(u.kurir), ''), 'Kolektor'),
         count(distinct u.kode), count(*)
  from public.courier_updates u join days using (tanggal_tukar)
  where u.status = 'Done'
  group by 1, 2
  order by 1 desc, 4 desc;
$$;

-- ══ FAKTUR PAJAK ═════════════════════════════════════════════════
create table public.ltkp_documents (
  id              bigint generated always as identity primary key,
  no_ltkp         text not null,
  storage_path    text not null,
  file_name       text,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  created_by_name text
);

create table public.tax_invoice_requests (
  id                bigint generated always as identity primary key,
  bp_value          text not null,
  invoice_date      date,
  invoice_no        text not null,
  no_sj             text,
  tax_no            text not null,
  request           text not null check (request in ('Revisi Faktur', 'Pembatalan Faktur')),
  reason            text not null check (reason in (
    'HUMAN EROR (DELIVERY)', 'HUMAN EROR (INVOICING)', 'HUMAN EROR (MARKETING)',
    'HUMAN EROR (FULFILLMENT)', 'HUMAN EROR (IT)', 'HUMAN EROR (WAREHOUSE)',
    'MISS INFORMATION', 'FACTOR EXTERNAL', 'REQUEST CUSTOMER',
    'HUMAN EROR (OR)', 'HUMAN EROR (MKT ANALIS)')),
  keterangan        text not null,
  processed_at      timestamptz,
  processed_by_name text,
  ltkp_id           bigint references public.ltkp_documents(id) on delete set null,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  created_by_name   text
);
create index tax_invoice_requests_ltkp_idx on public.tax_invoice_requests (ltkp_id);
create index tax_invoice_requests_invoice_idx on public.tax_invoice_requests (invoice_no);

create table public.tax_invoice_holds (
  id              bigint generated always as identity primary key,
  bp_value        text not null,
  invoice_date    date,
  invoice_no      text not null,
  no_sj           text,
  keterangan      text not null,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  created_by_name text,
  updated_at      timestamptz
);

create trigger stamp_creator before insert on public.ltkp_documents
  for each row execute function private.stamp_creator();
create trigger stamp_creator before insert on public.tax_invoice_requests
  for each row execute function private.stamp_creator();
create trigger stamp_creator before insert on public.tax_invoice_holds
  for each row execute function private.stamp_creator();

alter table public.ltkp_documents       enable row level security;
alter table public.tax_invoice_requests enable row level security;
alter table public.tax_invoice_holds    enable row level security;

create policy "baca pengajuan faktur" on public.tax_invoice_requests
  for select to authenticated using (
    private.has_menu('inv.batal') or private.has_menu('inv.pengajuan') or private.has_menu('ext.ltkp'));
create policy "ajukan faktur" on public.tax_invoice_requests
  for insert to authenticated with check (private.has_menu('inv.pengajuan'));
create policy "proses pengajuan faktur" on public.tax_invoice_requests
  for update to authenticated using (private.has_menu('inv.batal')) with check (private.has_menu('inv.batal'));

create policy "baca ltkp" on public.ltkp_documents
  for select to authenticated using (private.has_menu('inv.batal') or private.has_menu('ext.ltkp'));
create policy "unggah ltkp" on public.ltkp_documents
  for insert to authenticated with check (private.has_menu('inv.batal'));

create policy "baca hold faktur" on public.tax_invoice_holds
  for select to authenticated using (private.has_menu('inv.hold'));
create policy "tambah hold faktur" on public.tax_invoice_holds
  for insert to authenticated with check (private.has_menu('inv.hold'));
create policy "ubah hold faktur" on public.tax_invoice_holds
  for update to authenticated using (private.has_menu('inv.hold')) with check (private.has_menu('inv.hold'));
create policy "hapus hold faktur" on public.tax_invoice_holds
  for delete to authenticated using (private.has_menu('inv.hold'));

-- Cari invoice untuk isi otomatis form (dulu sheet 'Invoice' = salinan Update_Tagihan).
-- Definer: pengguna Faktur Pajak tidak harus punya akses ke data collection.
create or replace function public.lookup_invoice(p_invoice_no text)
returns table (invoice_no text, bp_value text, invoice_date date, no_sj text)
language sql stable security definer set search_path = ''
as $$
  select a.invoice_no,
         case when nullif(trim(a.bp_value), '') is null then a.business_partner
              else a.business_partner || '_' || a.bp_value end,
         a.invoice_date, a.no_sj
  from public.ar_invoices a
  where upper(a.invoice_no) = upper(trim(p_invoice_no))
    and (private.has_menu('inv.pengajuan') or private.has_menu('inv.hold'))
  limit 1;
$$;

revoke execute on function public.schedule_replace(jsonb, text) from public, anon;
revoke execute on function public.courier_dates() from public, anon;
revoke execute on function public.courier_names() from public, anon;
revoke execute on function public.courier_submit(jsonb, date, text, text, text, text) from public, anon;
revoke execute on function public.tukar_dashboard(text, text) from public, anon;
revoke execute on function public.jadwal_dates() from public, anon;
revoke execute on function public.jadwal_kolektor(date) from public, anon;
revoke execute on function public.recent_tukar() from public, anon;
revoke execute on function public.lookup_invoice(text) from public, anon;
grant execute on function public.schedule_replace(jsonb, text) to authenticated;
grant execute on function public.courier_dates() to authenticated;
grant execute on function public.courier_names() to authenticated;
grant execute on function public.courier_submit(jsonb, date, text, text, text, text) to authenticated;
grant execute on function public.tukar_dashboard(text, text) to authenticated;
grant execute on function public.jadwal_dates() to authenticated;
grant execute on function public.jadwal_kolektor(date) to authenticated;
grant execute on function public.recent_tukar() to authenticated;
grant execute on function public.lookup_invoice(text) to authenticated;

-- ══ STORAGE (privat) ═════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('tanda-terima', 'tanda-terima', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('ltkp', 'ltkp', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "baca foto tanda terima" on storage.objects
  for select to authenticated using (bucket_id = 'tanda-terima');
create policy "unggah foto tanda terima" on storage.objects
  for insert to authenticated with check (bucket_id = 'tanda-terima' and private.has_menu('tukar.detail'));
create policy "baca dokumen ltkp" on storage.objects
  for select to authenticated using (
    bucket_id = 'ltkp' and (private.has_menu('inv.batal') or private.has_menu('ext.ltkp')));
create policy "unggah dokumen ltkp" on storage.objects
  for insert to authenticated with check (bucket_id = 'ltkp' and private.has_menu('inv.batal'));

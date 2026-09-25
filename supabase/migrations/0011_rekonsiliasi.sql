-- 0011: Fase 3 — Cek Selisih Harga (PO vs SO), XML CoreTax, Marketplace.

-- ══ CEK SELISIH HARGA ════════════════════════════════════════════
-- Pengganti sheet MASTER (SO dari ERP; diganti penuh setiap upload).
create table public.so_master (
  id               bigint generated always as identity primary key,
  document_no      text,
  date_po          text,          -- dd/MM/yyyy seperti di sheet lama (hanya tampilan)
  no_po_customer   text,
  no_po_clean      text,          -- huruf besar, tanpa akhiran -REV/-REVn
  is_manual        boolean not null default false,
  business_partner text,
  price_list       text,
  document_status  text,
  grand_total      numeric(18,2) not null default 0
);
create index so_master_po_idx on public.so_master (no_po_clean);

-- Pengganti sheet ARSIP + TASK_COMPLETE (satu tabel, dibedakan status).
create table public.po_so_cases (
  id               bigint generated always as identity primary key,
  po_customer      text not null unique,
  document_no      text,
  date_po          text,
  business_partner text,
  price_list       text,
  document_status  text,
  total_po         numeric(18,2) not null default 0,
  total_so         numeric(18,2) not null default 0,
  selisih          numeric(18,2) not null default 0,
  aksi             text check (aksi in ('Litigasi', 'LTKP', 'Internal')),
  tindakan         text,
  keterangan       text,
  status           text not null default 'archived' check (status in ('archived', 'completed')),
  archived_at      timestamptz not null default now(),
  completed_at     timestamptz,
  created_by       uuid,
  created_by_name  text
);
create trigger stamp_creator before insert on public.po_so_cases
  for each row execute function private.stamp_creator();

alter table public.so_master   enable row level security;
alter table public.po_so_cases enable row level security;
create policy "baca so master" on public.so_master
  for select to authenticated using (private.has_menu('rek.cekharga'));
create policy "baca kasus po so" on public.po_so_cases
  for select to authenticated using (private.has_menu('rek.cekharga'));
create policy "arsipkan kasus po so" on public.po_so_cases
  for insert to authenticated with check (private.has_menu('rek.cekharga'));
create policy "ubah kasus po so" on public.po_so_cases
  for update to authenticated using (private.has_menu('rek.cekharga')) with check (private.has_menu('rek.cekharga'));

-- Upload SO bertahap: potongan pertama (p_reset = true) mengosongkan MASTER.
create or replace function public.so_master_load(p_rows jsonb, p_reset boolean, p_file_name text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not private.has_menu('rek.cekharga') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if p_reset then
    delete from public.so_master where true;
  end if;
  insert into public.so_master
    (document_no, date_po, no_po_customer, no_po_clean, is_manual, business_partner, price_list, document_status, grand_total)
  select r.document_no, r.date_po, r.no_po_customer,
         regexp_replace(upper(trim(coalesce(r.no_po_customer, ''))), '-REV\d*$', ''),
         upper(trim(coalesce(r.no_po_customer, ''))) ~ '-REV\d*$',
         r.business_partner, r.price_list, r.document_status, coalesce(r.grand_total, 0)
  from jsonb_to_recordset(p_rows) as r(
    document_no text, date_po text, no_po_customer text, business_partner text,
    price_list text, document_status text, grand_total numeric);
  get diagnostics v_count = row_count;
  if p_reset then
    insert into public.import_log (module, kind, file_name, rows, user_id)
    values ('cek_harga', 'so_master', p_file_name, v_count, (select auth.uid()));
  else
    update public.import_log set rows = rows + v_count
    where id = (select max(id) from public.import_log where module = 'cek_harga' and kind = 'so_master');
  end if;
  return v_count;
end;
$$;

-- Pivot SO per No PO (port getSOPivot): total Grand Total; data lain dari baris pertama.
create or replace function public.get_so_pivot(p_keys text[])
returns table (po text, total numeric, document_no text, date_po text, business_partner text,
               price_list text, document_status text, is_manual boolean)
language sql stable security invoker set search_path = ''
as $$
  select no_po_clean,
         sum(grand_total),
         (array_agg(document_no order by id))[1],
         (array_agg(date_po order by id))[1],
         (array_agg(business_partner order by id))[1],
         (array_agg(price_list order by id))[1],
         (array_agg(document_status order by id))[1],
         bool_or(is_manual)
  from public.so_master
  where no_po_clean = any(p_keys) and no_po_clean <> ''
  group by no_po_clean;
$$;

-- ══ XML CORETAX ══════════════════════════════════════════════════
-- Pengganti sheet TaxInvoices: setiap simpan menjadi satu batch (riwayat).
create table public.coretax_batches (
  id              bigint generated always as identity primary key,
  file_name       text,
  seller_tin      text,
  types           text,           -- filter jenis dokumen saat disimpan (kosong = semua)
  invoice_count   integer not null default 0,
  line_count      integer not null default 0,
  dpp             numeric(20,2) not null default 0,
  dpp_lain        numeric(20,2) not null default 0,
  ppn             numeric(20,2) not null default 0,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  created_by_name text
);
create trigger stamp_creator before insert on public.coretax_batches
  for each row execute function private.stamp_creator();

-- Satu baris per barang/jasa (kolom sama dengan sheet TaxInvoices). ID & kode = text.
create table public.coretax_lines (
  id                    bigint generated always as identity primary key,
  batch_id              bigint not null references public.coretax_batches(id) on delete cascade,
  no                    integer,
  tax_invoice_date      date,
  tax_invoice_opt       text,
  trx_code              text,
  ref_desc              text,
  seller_idtku          text,
  buyer_tin             text,
  buyer_document        text,
  buyer_country         text,
  buyer_document_number text,
  buyer_name            text,
  buyer_address         text,
  buyer_email           text,
  buyer_idtku           text,
  code                  text,
  name                  text,
  unit                  text,
  price                 numeric(20,2),
  qty                   numeric(20,4),
  total_discount        numeric(20,2),
  tax_base              numeric(20,2),
  other_tax_base        numeric(20,2),
  vat_rate              numeric(8,2),
  vat                   numeric(20,2),
  stlg_rate             numeric(8,2),
  stlg                  numeric(20,2)
);
create index coretax_lines_batch_idx on public.coretax_lines (batch_id);

-- Pengganti sheet "Hapus": daftar No Referensi yang dihapus otomatis.
create table public.coretax_delete_list (
  ref_desc        text primary key,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  created_by_name text
);
create trigger stamp_creator before insert on public.coretax_delete_list
  for each row execute function private.stamp_creator();

alter table public.coretax_batches     enable row level security;
alter table public.coretax_lines       enable row level security;
alter table public.coretax_delete_list enable row level security;
create policy "baca batch coretax" on public.coretax_batches
  for select to authenticated using (private.has_menu('rek.coretax'));
create policy "simpan batch coretax" on public.coretax_batches
  for insert to authenticated with check (private.has_menu('rek.coretax'));
create policy "hapus batch coretax" on public.coretax_batches
  for delete to authenticated using (private.has_menu('rek.coretax'));
create policy "baca baris coretax" on public.coretax_lines
  for select to authenticated using (private.has_menu('rek.coretax'));
create policy "simpan baris coretax" on public.coretax_lines
  for insert to authenticated with check (private.has_menu('rek.coretax'));
create policy "baca daftar hapus" on public.coretax_delete_list
  for select to authenticated using (private.has_menu('rek.coretax'));
create policy "tambah daftar hapus" on public.coretax_delete_list
  for insert to authenticated with check (private.has_menu('rek.coretax'));
create policy "kosongkan daftar hapus" on public.coretax_delete_list
  for delete to authenticated using (private.has_menu('rek.coretax'));

-- ══ MARKETPLACE ══════════════════════════════════════════════════
-- Satu laporan periode = satu baris (JSON utuh: Orders, Items, Adjustment, Balance, Erp, ...),
-- sama seperti penyimpanan lama (localStorage / spreadsheet).
create table public.mp_reports (
  report_id  text primary key,          -- {platform}_{username}_{dari}_{ke}
  platform   text not null check (platform in ('shopee', 'tiktok')),
  username   text not null,
  dari       text not null,           -- teks apa adanya dari file (biasanya YYYY-MM-DD)
  ke         text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

-- Indeks pesanan lintas periode (untuk analisis refund: pesanan asal di periode lain).
create table public.mp_order_index (
  report_id   text not null references public.mp_reports(report_id) on delete cascade,
  no          text not null,
  penghasilan numeric(20,2) not null default 0,
  primary key (report_id, no)
);
create index mp_order_index_no_idx on public.mp_order_index (no);

alter table public.mp_reports     enable row level security;
alter table public.mp_order_index enable row level security;
create policy "baca laporan marketplace" on public.mp_reports
  for select to authenticated using (private.has_menu('rek.marketplace'));
create policy "hapus laporan marketplace" on public.mp_reports
  for delete to authenticated using (private.has_menu('rek.marketplace'));
create policy "baca indeks pesanan" on public.mp_order_index
  for select to authenticated using (private.has_menu('rek.marketplace'));

-- Simpan (ganti) laporan dan bangun ulang indeks pesanannya dalam satu transaksi.
create or replace function public.mp_save_report(p_report jsonb)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id   text := p_report #>> '{meta,reportId}';
begin
  if not private.has_menu('rek.marketplace') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if v_id is null or v_id = '' then
    raise exception 'reportId kosong' using errcode = '22023';
  end if;

  insert into public.mp_reports (report_id, platform, username, dari, ke, data, updated_at, updated_by)
  values (v_id, p_report #>> '{meta,platform}', p_report #>> '{meta,username}',
          coalesce(p_report #>> '{meta,dari}', ''), coalesce(p_report #>> '{meta,ke}', ''),
          p_report, now(), (select auth.uid()))
  on conflict (report_id) do update set
    data = excluded.data, updated_at = now(), updated_by = excluded.updated_by;

  delete from public.mp_order_index where report_id = v_id;
  insert into public.mp_order_index (report_id, no, penghasilan)
  select v_id, o ->> 'no', sum(coalesce((o ->> 'penghasilan')::numeric, 0))
  from jsonb_array_elements(coalesce(p_report -> 'Orders', '[]'::jsonb)) o
  where coalesce(o ->> 'no', '') <> ''
  group by o ->> 'no';

  return v_id;
end;
$$;

revoke execute on function public.so_master_load(jsonb, boolean, text) from public, anon;
revoke execute on function public.get_so_pivot(text[]) from public, anon;
revoke execute on function public.mp_save_report(jsonb) from public, anon;
grant execute on function public.so_master_load(jsonb, boolean, text) to authenticated;
grant execute on function public.get_so_pivot(text[]) to authenticated;
grant execute on function public.mp_save_report(jsonb) to authenticated;

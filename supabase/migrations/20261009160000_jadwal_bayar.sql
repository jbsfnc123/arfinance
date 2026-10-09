-- Fase 58: "Jadwal Bayar" = SATU field per invoice untuk Mitra10, Daftar Tagihan, dan Dashboard Collection
-- (dulu "Janji Bayar" di Collection dan "Jadwal Bayar"/jadwal_transfer per No KW di Mitra10, terpisah).
-- Sumber tunggal: public.payment_promises (nama tabel tetap; append-only, baris terbaru per invoice yang berlaku).
-- Upload Jadwal Bayar Mitra10 (per No KW) kini juga mengisi field ini untuk setiap invoice di KW tsb.
-- Kunci internal (payment_promises.promise_date, JSON snapshot closing "promises") TIDAK diubah → bulan closed aman.

alter table public.payment_promises add column if not exists source text not null default 'manual';
alter table public.payment_promises add column if not exists ref text;
do $$ begin
  alter table public.payment_promises add constraint payment_promises_source_check check (source in ('manual', 'mitra10'));
exception when duplicate_object then null; end $$;
create index if not exists payment_promises_ref_idx on public.payment_promises (ref) where source = 'mitra10';
comment on column public.payment_promises.source is 'manual = diisi di Daftar Tagihan; mitra10 = dari upload Jadwal Bayar Mitra10 (ref = No KW)';

-- Salin Jadwal Bayar Mitra10 (per No KW) ke field terpadu per invoice. Invoice → KW memakai kwitansi PERTAMA (id
-- terkecil) per vendor_invoice_no, sama dengan lib/modules/m10/compute.ts. Hanya menambah baris bila tanggal terbaru
-- invoice itu berbeda (upload ulang tidak menggandakan). p_no_kw null = semua KW.
create or replace function private.m10_sync_promises(p_no_kw text[])
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  insert into public.payment_promises (invoice_no, business_partner, collection_name, promise_date, isi, source, ref)
  select f.invoice_no, a.business_partner, a.collection_name, s.jadwal_transfer,
         'Jadwal Bayar Mitra10 · KW ' || s.no_kw, 'mitra10', s.no_kw
  from (
    select distinct on (k.vendor_invoice_no) k.vendor_invoice_no as invoice_no, k.kuitansi_no
    from public.m10_kwitansi k
    where nullif(trim(k.vendor_invoice_no), '') is not null and nullif(trim(k.kuitansi_no), '') is not null
    order by k.vendor_invoice_no, k.id
  ) f
  join public.m10_payment_schedule s on s.no_kw = f.kuitansi_no
  left join public.ar_invoices a on a.invoice_no = f.invoice_no
  where s.jadwal_transfer is not null
    and (p_no_kw is null or s.no_kw = any(p_no_kw))
    and s.jadwal_transfer is distinct from (
      select p.promise_date from public.payment_promises p where p.invoice_no = f.invoice_no order by p.id desc limit 1);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function private.m10_sync_promises(text[]) from public, anon, authenticated;

-- Upload Jadwal Bayar Mitra10: isi sama seperti sebelumnya + sinkron ke field Jadwal Bayar per invoice.
create or replace function public.m10_schedule_upsert(p_rows jsonb, p_file_name text default null)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not private.has_menu('rek.mitra10') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  insert into public.m10_payment_schedule (no_kw, spp, nilai_kw, tgl_tukar_faktur, jadwal_transfer, notes)
  select distinct on (trim(r.no_kw)) trim(r.no_kw), r.spp, coalesce(r.nilai_kw, 0), r.tgl_tukar_faktur, r.jadwal_transfer, r.notes
  from jsonb_to_recordset(p_rows) as r(no_kw text, spp text, nilai_kw numeric, tgl_tukar_faktur date,
    jadwal_transfer date, notes text)
  where nullif(trim(r.no_kw), '') is not null
  order by trim(r.no_kw)
  on conflict (no_kw) do update set spp = excluded.spp, nilai_kw = excluded.nilai_kw,
    tgl_tukar_faktur = excluded.tgl_tukar_faktur, jadwal_transfer = excluded.jadwal_transfer, notes = excluded.notes;
  get diagnostics v_count = row_count;
  perform private.m10_sync_promises(array(
    select distinct trim(r->>'no_kw') from jsonb_array_elements(p_rows) r where nullif(trim(r->>'no_kw'), '') is not null));
  insert into public.import_log (module, kind, file_name, rows) values ('mitra10', 'jadwal', p_file_name, v_count);
  return v_count;
end;
$$;

-- Paket Mitra10: + promises = Jadwal Bayar terbaru per invoice Mitra10 (field terpadu).
create or replace function public.pack_m10()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_menu('rek.mitra10') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'worksheet', private.pack('select id, payment_group, business_partner, invoice_no, invoice_date, due_date, open_amt,
                                      branch, no_po, no_sj from public.m10_worksheet order by id',
      array['id', 'payment_group', 'business_partner', 'invoice_no', 'invoice_date', 'due_date', 'open_amt', 'branch',
            'no_po', 'no_sj']),
    'gr', private.pack('select id, no, store_no, delivery_to, gr_no, gr_date, po_no, po_date, vendor_ship_no, item_code,
                               item_name, uom, qty_order, qty_received, status, sj_no from public.m10_gr order by id',
      array['id', 'no', 'store_no', 'delivery_to', 'gr_no', 'gr_date', 'po_no', 'po_date', 'vendor_ship_no', 'item_code',
            'item_name', 'uom', 'qty_order', 'qty_received', 'status', 'sj_no']),
    'kwitansi', private.pack('select id, username, invoice_no, vendor_invoice_no, invoice_date, kuitansi_no, kuitansi_date,
                                     accepted_date, pfi_no, gr_no, po_no, total_net from public.m10_kwitansi order by id',
      array['id', 'username', 'invoice_no', 'vendor_invoice_no', 'invoice_date', 'kuitansi_no', 'kuitansi_date',
            'accepted_date', 'pfi_no', 'gr_no', 'po_no', 'total_net']),
    'schedule', private.pack('select no_kw, spp, nilai_kw, tgl_tukar_faktur, jadwal_transfer, notes
                                from public.m10_payment_schedule order by no_kw',
      array['no_kw', 'spp', 'nilai_kw', 'tgl_tukar_faktur', 'jadwal_transfer', 'notes']),
    'promises', private.pack('select distinct on (p.invoice_no) p.invoice_no, p.promise_date
                                from public.payment_promises p
                                where p.invoice_no in (select w.invoice_no from public.m10_worksheet w
                                                       union select k.vendor_invoice_no from public.m10_kwitansi k)
                                order by p.invoice_no, p.id desc',
      array['invoice_no', 'promise_date']));
end;
$$;

-- Salin sekali Jadwal Bayar Mitra10 yang sudah ada.
select private.m10_sync_promises(null);

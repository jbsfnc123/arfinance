-- 0019: Fase 10 — satu Keterangan per invoice yang sama di Collection, Mitra10 (Kertas Kerja),
-- dan Hold Faktur Pajak; Catatan collection ikut mengisinya. Case digabung menjadi coll.case.

create table public.invoice_remarks (
  invoice_no      text primary key,
  keterangan      text not null,
  source          text not null check (source in ('collection', 'mitra10', 'hold', 'pengajuan', 'catatan')),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles(id) on delete set null,
  updated_by_name text
);
create index invoice_remarks_updated_by_idx on public.invoice_remarks (updated_by);
alter table public.invoice_remarks enable row level security;
-- Baca langsung tidak dipakai UI (lewat pack_remarks), tapi aman dibatasi sama dengan menu penulis.
create policy "baca keterangan invoice" on public.invoice_remarks for select to authenticated
  using (private.is_ctrl() or private.has_menu('rek.mitra10') or private.has_menu('inv.hold') or private.has_menu('inv.pengajuan'));

create trigger bump_version_invoice_remarks after insert or update or delete or truncate on public.invoice_remarks
  for each statement execute function private.bump_version('remarks');
insert into public.data_versions (key, updated_at) values ('remarks', now()) on conflict (key) do nothing;

-- Boleh menulis? Role collection hanya untuk invoice di collection-nya (snapshot aging terkini).
create or replace function private.can_remark(p_invoices text[])
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if private.is_ctrl() or private.has_menu('rek.mitra10') or private.has_menu('inv.hold') or private.has_menu('inv.pengajuan') then
    return true;
  end if;
  if private.my_kind() = 'coll' and private.has_menu('coll.tagihan') then
    return not exists (
      select 1 from unnest(p_invoices) i(no)
      where not exists (
        select 1 from public.ar_aging_lines l
        where l.snapshot_id = (select id from public.ar_aging_snapshots order by month desc limit 1)
          and l.invoice_no = i.no and l.collection_name = private.my_collection()));
  end if;
  return false;
end;
$$;

create or replace function private.write_remark(p_invoices text[], p_text text, p_source text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if nullif(trim(p_text), '') is null then
    delete from public.invoice_remarks where invoice_no = any(p_invoices);
  else
    insert into public.invoice_remarks (invoice_no, keterangan, source, updated_at, updated_by, updated_by_name)
    select distinct trim(i), trim(p_text), p_source, now(), (select auth.uid()), private.my_name()
    from unnest(p_invoices) i where nullif(trim(i), '') is not null
    on conflict (invoice_no) do update set keterangan = excluded.keterangan, source = excluded.source,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by, updated_by_name = excluded.updated_by_name;
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function private.write_remark(text[], text, text) from public, anon, authenticated;

create or replace function public.set_invoice_remark(p_invoices text[], p_text text, p_source text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_source not in ('collection', 'mitra10', 'hold', 'pengajuan') then
    raise exception 'Sumber keterangan tidak dikenal' using errcode = '22023';
  end if;
  if not private.can_remark(p_invoices) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return private.write_remark(p_invoices, p_text, p_source);
end;
$$;

-- Kertas Kerja Mitra10: keterangan per baris → keterangan invoice bersama.
create or replace function public.m10_set_keterangan(p_ids bigint[], p_text text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.has_menu('rek.mitra10') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return private.write_remark(
    array(select invoice_no from public.m10_worksheet where id = any(p_ids) and invoice_no is not null), p_text, 'mitra10');
end;
$$;

-- Catatan collection baru → Keterangan invoice "[Kategori] isi".
create or replace function private.note_to_remark()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.write_remark(array[new.invoice_no],
    '[' || new.kategori || ']' || coalesce(' ' || nullif(trim(new.isi), ''), ''), 'catatan');
  return null;
end;
$$;
create trigger note_to_remark after insert on public.notes
  for each row execute function private.note_to_remark();

-- Pindahkan keterangan lama lalu hapus kolomnya (satu sumber).
insert into public.invoice_remarks (invoice_no, keterangan, source)
select distinct on (invoice_no) invoice_no, keterangan, 'mitra10' from public.m10_worksheet
where nullif(trim(keterangan), '') is not null and invoice_no is not null order by invoice_no, id desc
on conflict (invoice_no) do nothing;
insert into public.invoice_remarks (invoice_no, keterangan, source)
select distinct on (invoice_no) invoice_no, keterangan, 'hold' from public.tax_invoice_holds
where nullif(trim(keterangan), '') is not null order by invoice_no, id desc
on conflict (invoice_no) do nothing;
alter table public.m10_worksheet drop column keterangan;
alter table public.tax_invoice_holds drop column keterangan;

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
      array['no_kw', 'spp', 'nilai_kw', 'tgl_tukar_faktur', 'jadwal_transfer', 'notes']));
end;
$$;

-- Paket keterangan untuk browser. Role collection: hanya invoice di collection-nya.
create or replace function public.pack_remarks()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_where text;
begin
  if private.is_ctrl() or private.has_menu('rek.mitra10') or private.has_menu('inv.hold') or private.has_menu('inv.pengajuan') then
    v_where := 'true';
  elsif private.my_kind() = 'coll' then
    v_where := format('invoice_no in (select invoice_no from public.ar_aging_lines where snapshot_id =
      (select id from public.ar_aging_snapshots order by month desc limit 1) and collection_name = %L)', coalesce(private.my_collection(), ''));
  else
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return jsonb_build_object('remarks', private.pack(
    'select invoice_no, keterangan, source, updated_at, updated_by_name from public.invoice_remarks where ' || v_where,
    array['invoice_no', 'keterangan', 'source', 'updated_at', 'updated_by_name']));
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.set_invoice_remark(text[], text, text)', 'public.pack_remarks()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- Case Administratif + Case Collection → satu menu Case (coll.case).
insert into public.role_menus (role_id, submenu_id)
select distinct role_id, 'coll.case' from public.role_menus where submenu_id in ('case.admin', 'case.coll')
on conflict do nothing;
delete from public.role_menus where submenu_id in ('case.admin', 'case.coll', 'ext.modern');

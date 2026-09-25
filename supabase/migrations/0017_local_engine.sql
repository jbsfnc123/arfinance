-- 0017: Fase 9 — mesin data lokal. Server hanya mengirim PAKET DATA MENTAH berformat kolumnar
-- (nama kolom tidak diulang per baris; respons API sudah dikompres gzip/brotli). Semua
-- perhitungan & render dilakukan di browser. Hak akses dicek sekali per paket, bukan per baris.

-- ── Pembuat paket generik (internal; TIDAK boleh dipanggil user karena menerima SQL) ──
create or replace function private.pack(p_sql text, p_cols text[])
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_parts text; v_res jsonb;
begin
  select string_agg(format('%L, coalesce(jsonb_agg(t.%I), ''[]''::jsonb)', c, c), ', ')
  into v_parts from unnest(p_cols) c;
  -- Semua agregat membaca baris dalam urutan yang sama → kolom-kolom selalu sejajar.
  execute format('select jsonb_build_object(''n'', count(*), ''cols'', jsonb_build_object(%s)) from (%s) t', v_parts, p_sql)
  into v_res;
  return v_res;
end;
$$;
revoke execute on function private.pack(text, text[]) from public, anon, authenticated;

-- ── Aging snapshot terkini (Collection, Dashboard Controller, Dashboard Mitra 10, Mitra10) ──
create or replace function public.pack_aging()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_kind text := private.my_kind();
  v_all boolean;
  v_snap public.ar_aging_snapshots;
  v_where text;
begin
  v_all := v_kind in ('sa', 'ctrl') or private.has_menu('rek.mitra10') or private.has_menu('dash.mitra10')
           or private.has_menu('lap.presentasi');
  if not v_all and v_kind is distinct from 'coll' then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  select * into v_snap from public.ar_aging_snapshots order by month desc limit 1;
  v_where := format('snapshot_id = %s', coalesce(v_snap.id, -1))
    || case when v_all then '' else format(' and collection_name = %L', coalesce(private.my_collection(), '')) end;
  return jsonb_build_object(
    'month', v_snap.month, 'uploadedAt', v_snap.created_at,
    'lines', private.pack(
      'select line_no, invoice_no, payment_group, marketing, collection_name, sales_name, bp_key, business_partner,
              tax_name, invoice_date, due_date, open_amt, cur_0_30, cur_31_60, due_1_7, due_8_30, due_31_60,
              due_61_90, due_90, days, branch, no_po, no_sj
       from public.ar_aging_lines where ' || v_where || ' order by line_no',
      array['line_no', 'invoice_no', 'payment_group', 'marketing', 'collection_name', 'sales_name', 'bp_key',
            'business_partner', 'tax_name', 'invoice_date', 'due_date', 'open_amt', 'cur_0_30', 'cur_31_60',
            'due_1_7', 'due_8_30', 'due_31_60', 'due_61_90', 'due_90', 'days', 'branch', 'no_po', 'no_sj']));
end;
$$;

-- ── Aktivitas collection: catatan, janji bayar, tukar faktur ──
create or replace function public.pack_activity()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_kind text := private.my_kind(); v_where text;
begin
  if v_kind in ('sa', 'ctrl') then v_where := 'true';
  elsif v_kind = 'coll' then v_where := format('collection_name = %L', coalesce(private.my_collection(), ''));
  else raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'notes', private.pack('select id, invoice_no, kategori, business_partner, isi, collection_name, invoice_date, no_po, no_sj,
                                  done, closed_by, closed_at, created_at from public.notes where ' || v_where || ' order by id',
      array['id', 'invoice_no', 'kategori', 'business_partner', 'isi', 'collection_name', 'invoice_date', 'no_po', 'no_sj',
            'done', 'closed_by', 'closed_at', 'created_at']),
    'promises', private.pack('select id, invoice_no, business_partner, collection_name, promise_date, isi, created_at
                                from public.payment_promises where ' || v_where || ' order by id',
      array['id', 'invoice_no', 'business_partner', 'collection_name', 'promise_date', 'isi', 'created_at']),
    'exchanges', private.pack('select id, invoice_no, metode, tanggal, keterangan, resi, foto_path, kurir, collection_name
                                 from public.invoice_exchanges where ' || v_where || ' order by id',
      array['id', 'invoice_no', 'metode', 'tanggal', 'keterangan', 'resi', 'foto_path', 'kurir', 'collection_name']));
end;
$$;

create or replace function public.pack_targets()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (private.is_ctrl() or private.has_menu('rek.mutasi')) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return jsonb_build_object('targets', private.pack(
    'select month, invoice_no, target, marketing, collection_name, business_partner, due_date, branch
     from public.ar_targets order by month, invoice_no',
    array['month', 'invoice_no', 'target', 'marketing', 'collection_name', 'business_partner', 'due_date', 'branch']));
end;
$$;

-- ── Mitra10 ──
alter table public.m10_worksheet add column payment_group text;
update public.m10_worksheet w set payment_group = a.payment_group
from (select distinct on (upper(no_sj)) no_sj, payment_group from public.m10_aging order by upper(no_sj), id) a
where upper(a.no_sj) = upper(w.no_sj) and w.payment_group is null;

create or replace function private.m10_append_from_aging()
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  insert into public.m10_worksheet (payment_group, business_partner, invoice_no, invoice_date, due_date, open_amt, branch, no_po, no_sj)
  select distinct on (upper(a.no_sj))
         a.payment_group, a.business_partner, a.invoice_no, a.invoice_date, a.due_date, a.open_amt, a.branch, a.no_po, a.no_sj
  from public.m10_aging a
  where nullif(trim(a.no_sj), '') is not null
    and not exists (select 1 from public.m10_worksheet w where upper(w.no_sj) = upper(a.no_sj))
  order by upper(a.no_sj), a.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

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
                                      branch, no_po, no_sj, keterangan from public.m10_worksheet order by id',
      array['id', 'payment_group', 'business_partner', 'invoice_no', 'invoice_date', 'due_date', 'open_amt', 'branch',
            'no_po', 'no_sj', 'keterangan']),
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

-- Edit GR / Kwitansi dari layar. p_id null = baris baru. Hanya kunci yang ada di p_row yang diubah.
create or replace function public.m10_gr_save(p_id bigint, p_row jsonb)
returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare r public.m10_gr; v_id bigint;
begin
  if not private.has_menu('rek.mitra10') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  r := jsonb_populate_record(null::public.m10_gr, p_row);
  if p_id is null then
    insert into public.m10_gr (no, store_no, delivery_to, gr_no, gr_date, po_no, po_date, vendor_ship_no, item_code,
      item_name, uom, qty_order, qty_received, status, sj_no)
    values (r.no, r.store_no, r.delivery_to, r.gr_no, r.gr_date, r.po_no, r.po_date, r.vendor_ship_no, r.item_code,
      r.item_name, r.uom, r.qty_order, r.qty_received, r.status, r.sj_no)
    returning id into v_id;
    return v_id;
  end if;
  update public.m10_gr g set
    no = case when p_row ? 'no' then r.no else g.no end,
    store_no = case when p_row ? 'store_no' then r.store_no else g.store_no end,
    delivery_to = case when p_row ? 'delivery_to' then r.delivery_to else g.delivery_to end,
    gr_no = case when p_row ? 'gr_no' then r.gr_no else g.gr_no end,
    gr_date = case when p_row ? 'gr_date' then r.gr_date else g.gr_date end,
    po_no = case when p_row ? 'po_no' then r.po_no else g.po_no end,
    po_date = case when p_row ? 'po_date' then r.po_date else g.po_date end,
    vendor_ship_no = case when p_row ? 'vendor_ship_no' then r.vendor_ship_no else g.vendor_ship_no end,
    item_code = case when p_row ? 'item_code' then r.item_code else g.item_code end,
    item_name = case when p_row ? 'item_name' then r.item_name else g.item_name end,
    uom = case when p_row ? 'uom' then r.uom else g.uom end,
    qty_order = case when p_row ? 'qty_order' then r.qty_order else g.qty_order end,
    qty_received = case when p_row ? 'qty_received' then r.qty_received else g.qty_received end,
    status = case when p_row ? 'status' then r.status else g.status end,
    sj_no = case when p_row ? 'sj_no' then r.sj_no else g.sj_no end
  where g.id = p_id;
  if not found then raise exception 'Baris GR tidak ditemukan' using errcode = 'P0002'; end if;
  return p_id;
end;
$$;

create or replace function public.m10_kw_save(p_id bigint, p_row jsonb)
returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare r public.m10_kwitansi; v_id bigint;
begin
  if not private.has_menu('rek.mitra10') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  r := jsonb_populate_record(null::public.m10_kwitansi, p_row);
  if p_id is null then
    if nullif(trim(r.invoice_no), '') is null then
      raise exception 'Invoice No wajib diisi' using errcode = '22023';
    end if;
    insert into public.m10_kwitansi (username, invoice_no, vendor_invoice_no, invoice_date, kuitansi_no, kuitansi_date,
      accepted_date, pfi_no, gr_no, po_no, total_net)
    values (r.username, trim(r.invoice_no), r.vendor_invoice_no, r.invoice_date, r.kuitansi_no, r.kuitansi_date,
      r.accepted_date, r.pfi_no, r.gr_no, r.po_no, coalesce(r.total_net, 0))
    returning id into v_id;
    return v_id;
  end if;
  update public.m10_kwitansi k set
    username = case when p_row ? 'username' then r.username else k.username end,
    invoice_no = case when p_row ? 'invoice_no' then coalesce(nullif(trim(r.invoice_no), ''), k.invoice_no) else k.invoice_no end,
    vendor_invoice_no = case when p_row ? 'vendor_invoice_no' then r.vendor_invoice_no else k.vendor_invoice_no end,
    invoice_date = case when p_row ? 'invoice_date' then r.invoice_date else k.invoice_date end,
    kuitansi_no = case when p_row ? 'kuitansi_no' then r.kuitansi_no else k.kuitansi_no end,
    kuitansi_date = case when p_row ? 'kuitansi_date' then r.kuitansi_date else k.kuitansi_date end,
    accepted_date = case when p_row ? 'accepted_date' then r.accepted_date else k.accepted_date end,
    pfi_no = case when p_row ? 'pfi_no' then r.pfi_no else k.pfi_no end,
    gr_no = case when p_row ? 'gr_no' then r.gr_no else k.gr_no end,
    po_no = case when p_row ? 'po_no' then r.po_no else k.po_no end,
    total_net = case when p_row ? 'total_net' then coalesce(r.total_net, 0) else k.total_net end
  where k.id = p_id;
  if not found then raise exception 'Baris kwitansi tidak ditemukan' using errcode = 'P0002'; end if;
  return p_id;
end;
$$;

create or replace function public.m10_rows_delete(p_table text, p_ids bigint[])
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not private.has_menu('rek.mitra10') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if p_table = 'gr' then delete from public.m10_gr where id = any(p_ids);
  elsif p_table = 'kwitansi' then delete from public.m10_kwitansi where id = any(p_ids);
  else raise exception 'Tabel tidak dikenal' using errcode = '22023';
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Hitungan kini di browser: view & RPC lambat (31 dtk, timeout) serta mapping BP→Username dihapus.
drop function if exists public.m10_dashboard(text);
drop view if exists public.v_m10_worksheet;
drop view if exists public.v_m10_gr;
drop view if exists public.v_m10_kwitansi;
drop function if exists public.m10_bp_replace(jsonb);
drop table if exists public.m10_bp_users;

-- ── Mutasi & ERP ──
create or replace function public.pack_mutasi()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_menu('rek.mutasi') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'accounts', private.pack('select code, last4, sort, active from public.bank_accounts order by sort, code',
      array['code', 'last4', 'sort', 'active']),
    'mutations', private.pack('select id, account, tx_date, amount, keterangan, catatan, excluded, excluded_note
                                 from public.v_bank_mutations order by tx_date, id',
      array['id', 'account', 'tx_date', 'amount', 'keterangan', 'catatan', 'excluded', 'excluded_note']));
end;
$$;

create or replace function public.pack_erp()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (private.has_menu('rek.mutasi') or private.has_menu('lap.presentasi') or private.has_menu('rek.marketplace')) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'invoices', private.pack('select invoice_no, invoice_date, amount from public.erp_invoices order by invoice_date, invoice_no',
      array['invoice_no', 'invoice_date', 'amount']),
    'payments', private.pack('select invoice_no, payment_date, amount from public.erp_payments order by payment_date, id',
      array['invoice_no', 'payment_date', 'amount']));
end;
$$;

-- ── Tukar faktur (dashboard) ──
create or replace function public.pack_tukar()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_menu('dash.tukar') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return jsonb_build_object('done', private.pack(
    'select tanggal_tukar, kurir, business_partner, kode from public.courier_updates where status = ''Done'' order by id',
    array['tanggal_tukar', 'kurir', 'business_partner', 'kode']));
end;
$$;

-- ── Pengaturan (semua user yang login boleh membaca app_settings) ──
create or replace function public.pack_settings()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.app_settings;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.pack_aging()', 'public.pack_activity()', 'public.pack_targets()', 'public.pack_m10()',
    'public.pack_mutasi()', 'public.pack_erp()', 'public.pack_tukar()', 'public.pack_settings()',
    'public.m10_gr_save(bigint, jsonb)', 'public.m10_kw_save(bigint, jsonb)', 'public.m10_rows_delete(text, bigint[])'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

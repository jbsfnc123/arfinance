-- 0027: Fase 18 — RKM Tukar Faktur (Anyar Retail Indonesia), klon Mitra10 dengan kunci No SJ.
-- Menu 'tukar.rkm'. Kertas Kerja = SJ dari aging (Tax Name rkm_tax_name); GR & Kwitansi dari file
-- portal RKM (upload = ganti seluruh isi). Semua hitungan di browser (lib/modules/rkm).

-- ── Tabel ───────────────────────────────────────────────────────
create table public.rkm_worksheet (
  id               bigint generated always as identity primary key,
  business_partner text,
  invoice_no       text,
  invoice_date     date,
  due_date         date,
  open_amt         numeric(18,2),
  branch           text,
  no_po            text,
  no_sj            text not null,
  created_at       timestamptz not null default now()
);
create unique index rkm_worksheet_sj_key on public.rkm_worksheet (upper(no_sj));

create table public.rkm_gr (
  id              bigint generated always as identity primary key,
  no              text,
  grpo_no         text,
  no_sj           text,
  tgl_grpo        date,
  jumlah_grpo_grn numeric(18,2),
  no_faktur_pajak text,
  tgl_pajak       date,
  jumlah          numeric(18,2),
  selisih         numeric(18,2),
  cabang          text,
  no_po           text,
  jumlah_grpo     numeric(18,2),
  no_grn          text,
  jumlah_grn      numeric(18,2),
  created_at      timestamptz not null default now()
);
create index rkm_gr_sj_idx on public.rkm_gr (upper(no_sj));

create table public.rkm_kwitansi (
  id                  bigint generated always as identity primary key,
  no                  text,
  grpo_no             text,
  tgl_grpo            date,
  cabang              text,
  no_sj               text,
  no_po               text,
  jumlah_grpo         numeric(18,2),
  no_grn              text,
  total_grn           numeric(18,2),
  total_grpo_grn      numeric(18,2),
  tgl_faktur_pajak    date,
  no_faktur_pajak     text,
  jumlah_faktur_pajak numeric(18,2),
  selisih             numeric(18,2),
  pembuat             text,
  tanggal_input       date,
  created_at          timestamptz not null default now()
);
create index rkm_kwitansi_sj_idx on public.rkm_kwitansi (upper(no_sj));

alter table public.rkm_worksheet enable row level security;
alter table public.rkm_gr enable row level security;
alter table public.rkm_kwitansi enable row level security;
create policy "baca rkm worksheet" on public.rkm_worksheet for select to authenticated using (private.has_menu('tukar.rkm'));
create policy "baca rkm gr" on public.rkm_gr for select to authenticated using (private.has_menu('tukar.rkm'));
create policy "baca rkm kwitansi" on public.rkm_kwitansi for select to authenticated using (private.has_menu('tukar.rkm'));
grant select on public.rkm_worksheet, public.rkm_gr, public.rkm_kwitansi to authenticated;

-- Versi data untuk cache browser.
create trigger bump_version_rkm_worksheet after insert or update or delete or truncate on public.rkm_worksheet
  for each statement execute function private.bump_version('rkm');
create trigger bump_version_rkm_gr after insert or update or delete or truncate on public.rkm_gr
  for each statement execute function private.bump_version('rkm');
create trigger bump_version_rkm_kwitansi after insert or update or delete or truncate on public.rkm_kwitansi
  for each statement execute function private.bump_version('rkm');
insert into public.data_versions (key, updated_at) values ('rkm', now()) on conflict (key) do nothing;

insert into public.app_settings (key, value) values ('rkm_tax_name', to_jsonb('Anyar Retail Indonesia'::text))
on conflict (key) do nothing;

-- ── Kertas Kerja dari aging ─────────────────────────────────────
-- SJ baru (aging terkini, Tax Name cocok tanpa beda kapital) ditambahkan; SJ lama tetap ada
-- sehingga invoice yang hilang dari aging terbaca Lunas.
create or replace function private.rkm_append_from_aging()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_count integer; v_tax text;
begin
  select lower(trim(value #>> '{}')) into v_tax from public.app_settings where key = 'rkm_tax_name';
  if coalesce(v_tax, '') = '' then return 0; end if;
  insert into public.rkm_worksheet (business_partner, invoice_no, invoice_date, due_date, open_amt, branch, no_po, no_sj)
  select distinct on (upper(trim(a.no_sj)))
         a.business_partner, a.invoice_no, a.invoice_date, a.due_date, a.open_amt, a.branch, a.no_po, trim(a.no_sj)
  from public.ar_aging_lines a
  where a.snapshot_id = (select id from public.ar_aging_snapshots order by month desc limit 1)
    and lower(trim(a.tax_name)) = v_tax
    and nullif(trim(a.no_sj), '') is not null
    and not exists (select 1 from public.rkm_worksheet w where upper(w.no_sj) = upper(trim(a.no_sj)))
  order by upper(trim(a.no_sj)), a.line_no;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function private.rkm_append_from_aging() from public, anon, authenticated;

-- Upload aging (Pusat Upload / Mitra10 / RKM) langsung mengisi Kertas Kerja RKM.
create or replace function private.rkm_after_aging()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.rkm_append_from_aging();
  return null;
end;
$$;
revoke execute on function private.rkm_after_aging() from public, anon, authenticated;
create trigger rkm_after_aging after insert on public.ar_aging_lines
  for each statement execute function private.rkm_after_aging();

-- ── RPC ─────────────────────────────────────────────────────────
create or replace function public.rkm_sync()
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.has_menu('tukar.rkm') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return private.rkm_append_from_aging();
end;
$$;

create or replace function public.rkm_set_tax_name(p_value text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.has_menu('tukar.rkm') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if nullif(trim(p_value), '') is null then
    raise exception 'Tax Name wajib diisi' using errcode = '22023';
  end if;
  insert into public.app_settings (key, value) values ('rkm_tax_name', to_jsonb(trim(p_value)))
  on conflict (key) do update set value = excluded.value;
  return private.rkm_append_from_aging();
end;
$$;

-- Upload file GR RKM / Kwitansi RKM: ganti seluruh isi.
create or replace function public.rkm_gr_replace(p_rows jsonb, p_file_name text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not private.has_menu('tukar.rkm') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  delete from public.rkm_gr where true;
  insert into public.rkm_gr (no, grpo_no, no_sj, tgl_grpo, jumlah_grpo_grn, no_faktur_pajak, tgl_pajak, jumlah, selisih,
    cabang, no_po, jumlah_grpo, no_grn, jumlah_grn)
  select no, grpo_no, no_sj, tgl_grpo, jumlah_grpo_grn, no_faktur_pajak, tgl_pajak, jumlah, selisih,
    cabang, no_po, jumlah_grpo, no_grn, jumlah_grn
  from jsonb_populate_recordset(null::public.rkm_gr, p_rows);
  get diagnostics v_count = row_count;
  insert into public.import_log (module, kind, file_name, rows) values ('rkm', 'gr', p_file_name, v_count);
  return v_count;
end;
$$;

create or replace function public.rkm_kw_replace(p_rows jsonb, p_file_name text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not private.has_menu('tukar.rkm') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  delete from public.rkm_kwitansi where true;
  insert into public.rkm_kwitansi (no, grpo_no, tgl_grpo, cabang, no_sj, no_po, jumlah_grpo, no_grn, total_grn,
    total_grpo_grn, tgl_faktur_pajak, no_faktur_pajak, jumlah_faktur_pajak, selisih, pembuat, tanggal_input)
  select no, grpo_no, tgl_grpo, cabang, no_sj, no_po, jumlah_grpo, no_grn, total_grn,
    total_grpo_grn, tgl_faktur_pajak, no_faktur_pajak, jumlah_faktur_pajak, selisih, pembuat, tanggal_input
  from jsonb_populate_recordset(null::public.rkm_kwitansi, p_rows);
  get diagnostics v_count = row_count;
  insert into public.import_log (module, kind, file_name, rows) values ('rkm', 'kwitansi', p_file_name, v_count);
  return v_count;
end;
$$;

-- Edit / tambah satu baris (p_id null = tambah). Hanya kolom yang ada di p_row yang diubah.
create or replace function public.rkm_row_save(p_table text, p_id bigint, p_row jsonb)
returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare v_id bigint; v_cols text[]; v_set text; v_n integer;
begin
  if not private.has_menu('tukar.rkm') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if p_table = 'gr' then
    v_cols := array['no','grpo_no','no_sj','tgl_grpo','jumlah_grpo_grn','no_faktur_pajak','tgl_pajak','jumlah','selisih',
                    'cabang','no_po','jumlah_grpo','no_grn','jumlah_grn'];
  elsif p_table = 'kwitansi' then
    v_cols := array['no','grpo_no','tgl_grpo','cabang','no_sj','no_po','jumlah_grpo','no_grn','total_grn','total_grpo_grn',
                    'tgl_faktur_pajak','no_faktur_pajak','jumlah_faktur_pajak','selisih','pembuat','tanggal_input'];
  else
    raise exception 'Tabel tidak dikenal' using errcode = '22023';
  end if;

  if p_id is null then
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) returning id',
      'rkm_' || p_table, array_to_string(v_cols, ','), array_to_string(v_cols, ','), 'rkm_' || p_table)
      into v_id using p_row;
    return v_id;
  end if;

  select string_agg(format('%1$I = r.%1$I', col), ', ') into v_set
  from unnest(v_cols) col where p_row ? col;
  if v_set is null then return p_id; end if;
  execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where t.id = $2',
    'rkm_' || p_table, v_set, 'rkm_' || p_table) using p_row, p_id;
  get diagnostics v_n = row_count;  -- EXECUTE tidak mengubah FOUND
  if v_n = 0 then raise exception 'Baris tidak ditemukan' using errcode = 'P0002'; end if;
  return p_id;
end;
$$;

create or replace function public.rkm_rows_delete(p_table text, p_ids bigint[])
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not private.has_menu('tukar.rkm') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if p_table = 'gr' then delete from public.rkm_gr where id = any(p_ids);
  elsif p_table = 'kwitansi' then delete from public.rkm_kwitansi where id = any(p_ids);
  else raise exception 'Tabel tidak dikenal' using errcode = '22023';
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.pack_rkm()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_menu('tukar.rkm') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'worksheet', private.pack('select id, business_partner, invoice_no, invoice_date, due_date, open_amt, branch, no_po, no_sj
                               from public.rkm_worksheet order by id',
      array['id', 'business_partner', 'invoice_no', 'invoice_date', 'due_date', 'open_amt', 'branch', 'no_po', 'no_sj']),
    'gr', private.pack('select id, no, grpo_no, no_sj, tgl_grpo, jumlah_grpo_grn, no_faktur_pajak, tgl_pajak, jumlah, selisih,
                               cabang, no_po, jumlah_grpo, no_grn, jumlah_grn from public.rkm_gr order by id',
      array['id', 'no', 'grpo_no', 'no_sj', 'tgl_grpo', 'jumlah_grpo_grn', 'no_faktur_pajak', 'tgl_pajak', 'jumlah', 'selisih',
            'cabang', 'no_po', 'jumlah_grpo', 'no_grn', 'jumlah_grn']),
    'kwitansi', private.pack('select id, no, grpo_no, tgl_grpo, cabang, no_sj, no_po, jumlah_grpo, no_grn, total_grn, total_grpo_grn,
                                     tgl_faktur_pajak, no_faktur_pajak, jumlah_faktur_pajak, selisih, pembuat, tanggal_input
                              from public.rkm_kwitansi order by id',
      array['id', 'no', 'grpo_no', 'tgl_grpo', 'cabang', 'no_sj', 'no_po', 'jumlah_grpo', 'no_grn', 'total_grn', 'total_grpo_grn',
            'tgl_faktur_pajak', 'no_faktur_pajak', 'jumlah_faktur_pajak', 'selisih', 'pembuat', 'tanggal_input']));
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.rkm_sync()', 'public.rkm_set_tax_name(text)', 'public.rkm_gr_replace(jsonb, text)',
    'public.rkm_kw_replace(jsonb, text)', 'public.rkm_row_save(text, bigint, jsonb)', 'public.rkm_rows_delete(text, bigint[])',
    'public.pack_rkm()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ── Akses aging & Keterangan bersama untuk RKM ──────────────────
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
  v_all := v_kind in ('sa', 'ctrl') or private.has_menu('rek.mitra10') or private.has_menu('tukar.rkm') or private.has_menu('lap.presentasi');
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

alter table public.invoice_remarks drop constraint invoice_remarks_source_check;
alter table public.invoice_remarks add constraint invoice_remarks_source_check
  check (source in ('collection', 'mitra10', 'rkm', 'hold', 'pengajuan', 'catatan'));

create or replace function public.set_invoice_remark(p_items jsonb, p_text text, p_source text)
returns integer
language plpgsql security definer set search_path = ''
as $$
begin
  if p_source not in ('collection', 'mitra10', 'rkm', 'hold', 'pengajuan') then
    raise exception 'Sumber keterangan tidak dikenal' using errcode = '22023';
  end if;
  if not private.can_remark(p_items) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return private.write_remark(p_items, p_text, p_source);
end;
$$;

create or replace function private.can_remark(p_items jsonb)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if private.is_ctrl() or private.has_menu('rek.mitra10') or private.has_menu('tukar.rkm')
     or private.has_menu('inv.hold') or private.has_menu('inv.pengajuan') then
    return true;
  end if;
  if private.my_kind() = 'coll' and private.has_menu('coll.tagihan') then
    return not exists (
      select 1 from jsonb_array_elements(p_items) i
      where not exists (
        select 1 from public.ar_aging_lines l
        where l.snapshot_id = (select id from public.ar_aging_snapshots order by month desc limit 1)
          and l.collection_name = private.my_collection()
          and private.remark_ref(l.no_sj, l.invoice_no)
              = coalesce(private.remark_ref(i->>'no_sj', i->>'invoice_no'), upper(trim(i->>'ref')))));
  end if;
  return false;
end;
$$;

create or replace function public.pack_remarks()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_where text;
begin
  if private.is_ctrl() or private.has_menu('rek.mitra10') or private.has_menu('tukar.rkm')
     or private.has_menu('inv.hold') or private.has_menu('inv.pengajuan') then
    v_where := 'true';
  elsif private.my_kind() = 'coll' then
    v_where := format('ref in (select private.remark_ref(no_sj, invoice_no) from public.ar_aging_lines where snapshot_id =
      (select id from public.ar_aging_snapshots order by month desc limit 1) and collection_name = %L)', coalesce(private.my_collection(), ''));
  else
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return jsonb_build_object('remarks', private.pack(
    'select ref, no_sj, invoice_no, keterangan, source, updated_at, updated_by_name from public.invoice_remarks where ' || v_where,
    array['ref', 'no_sj', 'invoice_no', 'keterangan', 'source', 'updated_at', 'updated_by_name']));
end;
$$;

drop policy "baca keterangan invoice" on public.invoice_remarks;
create policy "baca keterangan invoice" on public.invoice_remarks for select to authenticated
  using (private.is_ctrl() or private.has_menu('rek.mitra10') or private.has_menu('tukar.rkm')
         or private.has_menu('inv.hold') or private.has_menu('inv.pengajuan'));

-- Isi awal Kertas Kerja dari aging yang sudah ada.
select private.rkm_append_from_aging();

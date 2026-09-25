-- 0021: Fase 12 — Keterangan diikat ke No SJ (tetap walau invoice direvisi), No SJ di target.

-- Kunci keterangan: No SJ (dinormalisasi); invoice tanpa SJ memakai 'INV:<invoice_no>'.
create or replace function private.remark_ref(p_no_sj text, p_invoice_no text)
returns text
language sql immutable set search_path = ''
as $$
  select case when nullif(trim(p_no_sj), '') is not null then upper(trim(p_no_sj))
              when nullif(trim(p_invoice_no), '') is not null then 'INV:' || upper(trim(p_invoice_no)) end;
$$;
grant execute on function private.remark_ref(text, text) to authenticated;

-- ── invoice_remarks: PK invoice_no → ref (No SJ) ──
alter table public.invoice_remarks add column ref text, add column no_sj text;
update public.invoice_remarks r set no_sj = coalesce(
  (select l.no_sj from public.ar_aging_lines l
    where l.snapshot_id = (select id from public.ar_aging_snapshots order by month desc limit 1)
      and l.invoice_no = r.invoice_no and nullif(trim(l.no_sj), '') is not null order by l.line_no limit 1),
  (select w.no_sj from public.m10_worksheet w where w.invoice_no = r.invoice_no limit 1),
  (select n.no_sj from public.notes n where n.invoice_no = r.invoice_no and nullif(trim(n.no_sj), '') is not null order by n.id desc limit 1),
  (select h.no_sj from public.tax_invoice_holds h where h.invoice_no = r.invoice_no and nullif(trim(h.no_sj), '') is not null limit 1));
update public.invoice_remarks set ref = private.remark_ref(no_sj, invoice_no);
delete from public.invoice_remarks a using public.invoice_remarks b
where a.ref = b.ref and a.updated_at < b.updated_at;
alter table public.invoice_remarks drop constraint invoice_remarks_pkey;
alter table public.invoice_remarks alter column ref set not null, alter column invoice_no drop not null;
alter table public.invoice_remarks add primary key (ref);
create index invoice_remarks_invoice_idx on public.invoice_remarks (invoice_no);

drop function if exists public.set_invoice_remark(text[], text, text);
drop function if exists private.write_remark(text[], text, text);
drop function if exists private.can_remark(text[]);

-- p_items = [{ref, no_sj, invoice_no}] (ref dihitung ulang di server dari no_sj/invoice_no bila ada).
create or replace function private.write_remark(p_items jsonb, p_text text, p_source text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  create temp table if not exists _rm (ref text primary key, no_sj text, invoice_no text) on commit drop;
  truncate _rm;
  insert into _rm (ref, no_sj, invoice_no)
  select distinct on (k.ref) k.ref, k.no_sj, k.invoice_no from (
    select coalesce(private.remark_ref(i->>'no_sj', i->>'invoice_no'), upper(trim(i->>'ref'))) as ref,
           nullif(trim(i->>'no_sj'), '') as no_sj, nullif(trim(i->>'invoice_no'), '') as invoice_no
    from jsonb_array_elements(p_items) i) k
  where k.ref is not null
  order by k.ref;
  if nullif(trim(p_text), '') is null then
    delete from public.invoice_remarks where ref in (select ref from _rm);
  else
    insert into public.invoice_remarks (ref, no_sj, invoice_no, keterangan, source, updated_at, updated_by, updated_by_name)
    select ref, no_sj, invoice_no, trim(p_text), p_source, now(), (select auth.uid()), private.my_name() from _rm
    on conflict (ref) do update set keterangan = excluded.keterangan, source = excluded.source,
      no_sj = coalesce(excluded.no_sj, public.invoice_remarks.no_sj),
      invoice_no = coalesce(excluded.invoice_no, public.invoice_remarks.invoice_no),
      updated_at = excluded.updated_at, updated_by = excluded.updated_by, updated_by_name = excluded.updated_by_name;
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function private.write_remark(jsonb, text, text) from public, anon, authenticated;

create or replace function private.can_remark(p_items jsonb)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if private.is_ctrl() or private.has_menu('rek.mitra10') or private.has_menu('inv.hold') or private.has_menu('inv.pengajuan') then
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

create or replace function public.set_invoice_remark(p_items jsonb, p_text text, p_source text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_source not in ('collection', 'mitra10', 'hold', 'pengajuan') then
    raise exception 'Sumber keterangan tidak dikenal' using errcode = '22023';
  end if;
  if not private.can_remark(p_items) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return private.write_remark(p_items, p_text, p_source);
end;
$$;
revoke execute on function public.set_invoice_remark(jsonb, text, text) from public, anon;
grant execute on function public.set_invoice_remark(jsonb, text, text) to authenticated;

create or replace function public.m10_set_keterangan(p_ids bigint[], p_text text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.has_menu('rek.mitra10') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return private.write_remark(
    (select coalesce(jsonb_agg(jsonb_build_object('no_sj', no_sj, 'invoice_no', invoice_no)), '[]') from public.m10_worksheet where id = any(p_ids)),
    p_text, 'mitra10');
end;
$$;

create or replace function private.note_to_remark()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.write_remark(jsonb_build_array(jsonb_build_object('no_sj', new.no_sj, 'invoice_no', new.invoice_no)),
    '[' || new.kategori || ']' || coalesce(' ' || nullif(trim(new.isi), ''), ''), 'catatan');
  return null;
end;
$$;

create or replace function public.pack_remarks()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_where text;
begin
  if private.is_ctrl() or private.has_menu('rek.mitra10') or private.has_menu('inv.hold') or private.has_menu('inv.pengajuan') then
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

-- ── No SJ di target bulanan (deteksi revisi invoice) ──
alter table public.ar_targets add column no_sj text;

create or replace function public.ar_target_replace(p_month text, p_rows jsonb, p_file_name text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not (private.is_ctrl() and (private.has_menu('set.target') or private.has_menu('rek.mutasi'))) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if p_month !~ '^\d{4}-\d{2}$' then
    raise exception 'Format bulan harus YYYY-MM' using errcode = '22023';
  end if;

  delete from public.ar_targets where month = p_month;
  insert into public.ar_targets
    (month, invoice_no, target, marketing, collection_name, business_partner, due_date, branch, no_sj)
  select distinct on (r.invoice_no)
    p_month, r.invoice_no, r.target,
    coalesce(nullif(trim(r.marketing), ''), a.marketing),
    coalesce(nullif(trim(r.collection_name), ''), a.collection_name),
    coalesce(nullif(trim(r.business_partner), ''), a.business_partner),
    coalesce(r.due_date, a.due_date),
    nullif(trim(r.branch), ''),
    coalesce(nullif(trim(r.no_sj), ''), a.no_sj)
  from jsonb_to_recordset(p_rows) as r(
    invoice_no text, target numeric, marketing text, collection_name text,
    business_partner text, due_date date, branch text, no_sj text)
  left join public.ar_invoices a on a.invoice_no = r.invoice_no
  where nullif(trim(r.invoice_no), '') is not null and r.target is not null
  order by r.invoice_no;
  get diagnostics v_count = row_count;

  update public.data_versions set updated_at = now() where key = 'ar_targets';
  insert into public.import_log (module, kind, file_name, months, rows, user_id)
  values ('collection', 'target', p_file_name, array[p_month], v_count, (select auth.uid()));
  return v_count;
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
    'select month, invoice_no, target, marketing, collection_name, business_partner, due_date, branch, no_sj
     from public.ar_targets order by month, invoice_no',
    array['month', 'invoice_no', 'target', 'marketing', 'collection_name', 'business_partner', 'due_date', 'branch', 'no_sj']));
end;
$$;

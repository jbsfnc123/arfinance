-- Fase 60: modul Billing › Email Customer (menggantikan menu placeholder E-Commerce).
-- Skema relasional: grup Payment Group (email & PIC per grup) ← BP (tab BP CBD/TOP atau anggota Group CBD/TOP) ←
-- alamat email (satu baris per alamat, milik BP atau grup). Hapus = arsip/nonaktif (riwayat tetap ada).
-- Payment Group / Collection / Marketing yang kosong diambil dari database (Aging terkini, cadangan invoice ERP) lewat
-- bp_key hasil pencocokan Value.

create table if not exists public.email_groups (
  id bigint generated always as identity primary key,
  term text not null check (term in ('CBD', 'TOP')),
  payment_group text not null check (char_length(btrim(payment_group)) between 1 and 200),
  pic_ar text check (char_length(pic_ar) <= 120),
  keterangan text check (char_length(keterangan) <= 1000),
  email_note text check (char_length(email_note) <= 1000),
  archived_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null
);
create unique index if not exists email_groups_uq on public.email_groups (term, lower(btrim(payment_group))) where archived_at is null;

create table if not exists public.email_customers (
  id bigint generated always as identity primary key,
  term text not null check (term in ('CBD', 'TOP')),
  level text not null check (level in ('BP', 'Group')),
  group_id bigint references public.email_groups(id) on delete restrict,
  business_partner text not null check (char_length(btrim(business_partner)) between 1 and 200),
  bp_value text check (char_length(bp_value) <= 120),
  bp_key text,
  payment_group text check (char_length(payment_group) <= 200),
  pic_ar text check (char_length(pic_ar) <= 120),
  keterangan text check (char_length(keterangan) <= 1000),
  email_note text check (char_length(email_note) <= 1000),
  archived_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  check ((level = 'Group') = (group_id is not null))
);
create unique index if not exists email_customers_uq on public.email_customers
  (term, level, coalesce(group_id, 0), lower(btrim(business_partner)), lower(coalesce(btrim(bp_value), '')))
  where archived_at is null;
create index if not exists email_customers_group_idx on public.email_customers (group_id);
create index if not exists email_customers_bp_key_idx on public.email_customers (bp_key);

create table if not exists public.email_addresses (
  id bigint generated always as identity primary key,
  customer_id bigint references public.email_customers(id) on delete cascade,
  group_id bigint references public.email_groups(id) on delete cascade,
  email text not null check (email ~* '^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$'),
  sort integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  check (num_nonnulls(customer_id, group_id) = 1)
);
create unique index if not exists email_addresses_customer_uq on public.email_addresses (customer_id, lower(email)) where customer_id is not null;
create unique index if not exists email_addresses_group_uq on public.email_addresses (group_id, lower(email)) where group_id is not null;

-- Baca langsung hanya untuk pemegang menu; tulis hanya lewat RPC.
alter table public.email_groups enable row level security;
alter table public.email_customers enable row level security;
alter table public.email_addresses enable row level security;
create policy "baca grup email customer" on public.email_groups for select to authenticated using (private.has_menu('bill.email'));
create policy "baca email customer" on public.email_customers for select to authenticated using (private.has_menu('bill.email'));
create policy "baca alamat email customer" on public.email_addresses for select to authenticated using (private.has_menu('bill.email'));
revoke all on public.email_groups, public.email_customers, public.email_addresses from anon, authenticated;
grant select on public.email_groups, public.email_customers, public.email_addresses to authenticated;

insert into public.data_versions (key, updated_at) values ('email_customer', now()) on conflict (key) do nothing;
create trigger bump_version_email_groups after insert or update or delete or truncate on public.email_groups
  for each statement execute function private.bump_version('email_customer');
create trigger bump_version_email_customers after insert or update or delete or truncate on public.email_customers
  for each statement execute function private.bump_version('email_customer');
create trigger bump_version_email_addresses after insert or update or delete or truncate on public.email_addresses
  for each statement execute function private.bump_version('email_customer');

-- Value (Excel/isian) → key BP di Aging/ERP: sama persis (tanpa beda huruf), selain itu angka depan bila hanya satu
-- key yang cocok (mis. 1017843 → "1017843-PKP"; "1020572 - Palembang" → "1020572 (Palembang)").
create or replace function private.email_match_key(p_value text)
returns text
language sql stable security definer set search_path = ''
as $$
  with v as (select nullif(btrim(coalesce(p_value, '')), '') as v),
  keys as (
    select distinct a.bp_key as k from public.v_aging_current a where a.bp_key is not null
    union select distinct e.bp_key from public.erp_invoices e where e.bp_key is not null
  )
  select coalesce(
    (select k from keys, v where upper(btrim(k)) = upper(v.v) limit 1),
    (select min(k) from keys, v where substring(btrim(k) from '^\d+') = substring(v.v from '^\d+') having count(*) = 1));
$$;
revoke execute on function private.email_match_key(text) from public, anon, authenticated;

create or replace function private.email_clean_list(p_emails jsonb)
returns text[]
language sql immutable set search_path = ''
as $$
  select coalesce(array_agg(e order by ord), '{}') from (
    select distinct on (lower(btrim(x))) lower(btrim(x)) as e, ord
    from jsonb_array_elements_text(coalesce(p_emails, '[]'::jsonb)) with ordinality t(x, ord)
    where btrim(x) <> '' order by lower(btrim(x)), ord) s;
$$;

-- Simpan daftar email pemilik: yang tidak ada lagi dinonaktifkan, yang baru/aktif kembali disimpan sesuai urutan.
create or replace function private.email_set_addresses(p_customer bigint, p_group bigint, p_emails text[])
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_bad text;
begin
  select e into v_bad from unnest(p_emails) e where e !~* '^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$' limit 1;
  if v_bad is not null then raise exception 'Alamat email tidak valid: %', v_bad using errcode = '22023'; end if;
  if cardinality(p_emails) > 20 then raise exception 'Maksimal 20 email' using errcode = '22023'; end if;
  update public.email_addresses a set active = false, updated_at = now()
  where a.active and ((p_customer is not null and a.customer_id = p_customer) or (p_group is not null and a.group_id = p_group))
    and lower(a.email) <> all (p_emails);
  insert into public.email_addresses (customer_id, group_id, email, sort, active)
  select p_customer, p_group, e, ord, true from unnest(p_emails) with ordinality t(e, ord)
  on conflict do nothing;
  update public.email_addresses a set active = true, sort = t.ord, updated_at = now()
  from unnest(p_emails) with ordinality t(e, ord)
  where lower(a.email) = t.e and ((p_customer is not null and a.customer_id = p_customer) or (p_group is not null and a.group_id = p_group));
end;
$$;
revoke execute on function private.email_set_addresses(bigint, bigint, text[]) from public, anon, authenticated;

-- Tambah/ubah BP. p: {id?, term, level, group_id?, business_partner, bp_value?, payment_group?, pic_ar?, keterangan?,
-- email_note?, emails: []}. Mengembalikan {id, bp_key}.
create or replace function public.email_customer_save(p jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id bigint := nullif(p->>'id', '')::bigint;
  v_term text := p->>'term'; v_level text := p->>'level';
  v_group bigint := nullif(p->>'group_id', '')::bigint;
  v_bp text := nullif(btrim(coalesce(p->>'business_partner', '')), '');
  v_value text := nullif(btrim(coalesce(p->>'bp_value', '')), '');
  v_key text;
begin
  if not private.has_menu('bill.email') then raise exception 'Akses ditolak' using errcode = '42501'; end if;
  if v_term not in ('CBD', 'TOP') or v_level not in ('BP', 'Group') then raise exception 'Jenis tidak valid' using errcode = '22023'; end if;
  if v_bp is null then raise exception 'Business Partner wajib diisi' using errcode = '22023'; end if;
  if v_level = 'Group' then
    if not exists (select 1 from public.email_groups g where g.id = v_group and g.term = v_term and g.archived_at is null) then
      raise exception 'Payment Group tidak ditemukan' using errcode = '22023';
    end if;
  else v_group := null; end if;
  v_key := private.email_match_key(v_value);
  if v_id is null then
    insert into public.email_customers (term, level, group_id, business_partner, bp_value, bp_key, payment_group, pic_ar, keterangan, email_note)
    values (v_term, v_level, v_group, v_bp, v_value, v_key, nullif(btrim(coalesce(p->>'payment_group', '')), ''),
      nullif(btrim(coalesce(p->>'pic_ar', '')), ''), nullif(btrim(coalesce(p->>'keterangan', '')), ''), nullif(btrim(coalesce(p->>'email_note', '')), ''))
    returning id into v_id;
  else
    update public.email_customers c set term = v_term, level = v_level, group_id = v_group, business_partner = v_bp,
      bp_value = v_value, bp_key = v_key, payment_group = nullif(btrim(coalesce(p->>'payment_group', '')), ''),
      pic_ar = nullif(btrim(coalesce(p->>'pic_ar', '')), ''), keterangan = nullif(btrim(coalesce(p->>'keterangan', '')), ''),
      email_note = nullif(btrim(coalesce(p->>'email_note', '')), ''), updated_at = now(), updated_by = auth.uid()
    where c.id = v_id and c.archived_at is null;
    if not found then raise exception 'Data tidak ditemukan' using errcode = '22023'; end if;
  end if;
  perform private.email_set_addresses(v_id, null, private.email_clean_list(p->'emails'));
  return jsonb_build_object('id', v_id, 'bp_key', v_key);
exception when unique_violation then
  raise exception 'Business Partner dengan Value yang sama sudah ada di tab ini' using errcode = '23505';
end;
$$;

-- Tambah/ubah Payment Group (tab Group). p: {id?, term, payment_group, pic_ar?, keterangan?, email_note?, emails: []}.
create or replace function public.email_group_save(p jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id bigint := nullif(p->>'id', '')::bigint;
  v_term text := p->>'term';
  v_pg text := nullif(btrim(coalesce(p->>'payment_group', '')), '');
begin
  if not private.has_menu('bill.email') then raise exception 'Akses ditolak' using errcode = '42501'; end if;
  if v_term not in ('CBD', 'TOP') then raise exception 'Jenis tidak valid' using errcode = '22023'; end if;
  if v_pg is null then raise exception 'Payment Group wajib diisi' using errcode = '22023'; end if;
  if v_id is null then
    insert into public.email_groups (term, payment_group, pic_ar, keterangan, email_note)
    values (v_term, v_pg, nullif(btrim(coalesce(p->>'pic_ar', '')), ''), nullif(btrim(coalesce(p->>'keterangan', '')), ''),
      nullif(btrim(coalesce(p->>'email_note', '')), ''))
    returning id into v_id;
  else
    update public.email_groups g set payment_group = v_pg, pic_ar = nullif(btrim(coalesce(p->>'pic_ar', '')), ''),
      keterangan = nullif(btrim(coalesce(p->>'keterangan', '')), ''), email_note = nullif(btrim(coalesce(p->>'email_note', '')), ''),
      updated_at = now(), updated_by = auth.uid()
    where g.id = v_id and g.term = v_term and g.archived_at is null;
    if not found then raise exception 'Payment Group tidak ditemukan' using errcode = '22023'; end if;
  end if;
  perform private.email_set_addresses(null, v_id, private.email_clean_list(p->'emails'));
  return jsonb_build_object('id', v_id);
exception when unique_violation then
  raise exception 'Payment Group ini sudah ada' using errcode = '23505';
end;
$$;

-- Arsipkan BP (atau Payment Group beserta anggotanya). Data tidak dihapus permanen.
create or replace function public.email_customer_archive(p_customer bigint, p_group bigint)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_n integer;
begin
  if not private.has_menu('bill.email') then raise exception 'Akses ditolak' using errcode = '42501'; end if;
  if p_group is not null then
    update public.email_customers set archived_at = now(), updated_at = now(), updated_by = auth.uid()
    where group_id = p_group and archived_at is null;
    update public.email_groups set archived_at = now(), updated_at = now(), updated_by = auth.uid()
    where id = p_group and archived_at is null;
  else
    update public.email_customers set archived_at = now(), updated_at = now(), updated_by = auth.uid()
    where id = p_customer and archived_at is null;
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Paket data modul: grup, BP, email aktif, dan lookup per bp_key (Aging terkini, cadangan invoice ERP terakhir).
create or replace function public.pack_email_customer()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_menu('bill.email') then raise exception 'Akses ditolak' using errcode = '42501'; end if;
  return jsonb_build_object(
    'groups', private.pack('select id, term, payment_group, pic_ar, keterangan, email_note, updated_at
        from public.email_groups where archived_at is null order by id',
      array['id', 'term', 'payment_group', 'pic_ar', 'keterangan', 'email_note', 'updated_at']),
    'customers', private.pack('select c.id, c.term, c.level, c.group_id, c.business_partner, c.bp_value, c.bp_key,
        c.payment_group, c.pic_ar, c.keterangan, c.email_note, c.updated_at
        from public.email_customers c where c.archived_at is null order by c.id',
      array['id', 'term', 'level', 'group_id', 'business_partner', 'bp_value', 'bp_key', 'payment_group', 'pic_ar',
            'keterangan', 'email_note', 'updated_at']),
    'emails', private.pack('select customer_id, group_id, email from public.email_addresses where active order by sort, id',
      array['customer_id', 'group_id', 'email']),
    'lookup', private.pack('with k as (select distinct bp_key from public.email_customers where bp_key is not null and archived_at is null),
        ag as (select distinct on (a.bp_key) a.bp_key, a.payment_group, a.collection_name, a.marketing, a.sales_name, a.branch, a.business_partner
               from public.v_aging_current a join k on k.bp_key = a.bp_key order by a.bp_key, a.line_no),
        er as (select distinct on (e.bp_key) e.bp_key, e.bp_group, e.marketing_group, e.branch, e.bp_name
               from public.erp_invoices e join k on k.bp_key = e.bp_key order by e.bp_key, e.invoice_date desc nulls last)
        select k.bp_key, coalesce(ag.payment_group, er.bp_group) as payment_group, ag.collection_name,
               coalesce(ag.marketing, er.marketing_group) as marketing, ag.sales_name, coalesce(ag.branch, er.branch) as branch,
               coalesce(ag.business_partner, er.bp_name) as bp_name, (ag.bp_key is not null) as in_aging
        from k left join ag on ag.bp_key = k.bp_key left join er on er.bp_key = k.bp_key order by k.bp_key',
      array['bp_key', 'payment_group', 'collection_name', 'marketing', 'sales_name', 'branch', 'bp_name', 'in_aging']));
end;
$$;

revoke execute on function public.email_customer_save(jsonb), public.email_group_save(jsonb),
  public.email_customer_archive(bigint, bigint), public.pack_email_customer() from public, anon;
grant execute on function public.email_customer_save(jsonb), public.email_group_save(jsonb),
  public.email_customer_archive(bigint, bigint), public.pack_email_customer() to authenticated;

-- Menu E-Commerce (bill.ecom, placeholder) → Email Customer (bill.email); default untuk role Controller.
update public.profile_menus set submenu_id = 'bill.email' where submenu_id = 'bill.ecom'
  and not exists (select 1 from public.profile_menus x where x.user_id = profile_menus.user_id and x.submenu_id = 'bill.email');
update public.role_menus set submenu_id = 'bill.email' where submenu_id = 'bill.ecom'
  and not exists (select 1 from public.role_menus x where x.role_id = role_menus.role_id and x.submenu_id = 'bill.email');
insert into public.role_menus (role_id, submenu_id)
select r.id, 'bill.email' from public.roles r where r.kind = 'ctrl' on conflict do nothing;
insert into public.profile_menus (user_id, submenu_id)
select p.id, 'bill.email' from public.profiles p join public.roles r on r.id = p.role_id
where r.kind = 'ctrl' and p.active and not p.system_account on conflict do nothing;

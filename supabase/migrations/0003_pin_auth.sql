-- 0003: login PIN 6 digit menggantikan Google OAuth.
-- Setiap akun tetap user Supabase Auth (email sintetis, password turunan di server),
-- tetapi identitas dicari dari PIN. Hak akses menu diatur per role.

-- ── Buang mekanisme OAuth lama ──────────────────────────────────
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists public.email_allowlist;
drop table if exists public.menu_acl;

-- ── Role & akses menu per role ───────────────────────────────────
create table public.roles (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  -- sa = Super Admin (semua menu), ctrl = Controller, coll = Collection (data dibatasi
  -- ke collection_name miliknya), kurir = kolektor tukar faktur
  kind       text not null check (kind in ('sa','ctrl','coll','kurir')),
  created_at timestamptz not null default now()
);

insert into public.roles (name, kind) values
  ('Super Admin', 'sa'),
  ('Manager',     'ctrl'),
  ('Supervisor',  'ctrl'),
  ('Collection',  'coll'),
  ('Kurir',       'kurir');

-- ID submenu = MENU_REGISTRY di lib/menu.ts. Role 'sa' melihat semua tanpa entri di sini.
create table public.role_menus (
  role_id    uuid not null references public.roles(id) on delete cascade,
  submenu_id text not null,
  primary key (role_id, submenu_id)
);

alter table public.profiles
  drop column kind,
  drop column role,
  add column role_id  uuid not null references public.roles(id) on delete restrict,
  add column pin_hash text unique;
alter table public.profiles alter column display_name set not null;
create index profiles_role_id_idx on public.profiles (role_id);

-- ── Penyimpanan PIN ─────────────────────────────────────────────
-- PIN disimpan sebagai HMAC(pin, pepper): deterministik (bisa dicari & dibuat unik)
-- tanpa menyimpan PIN aslinya. Pepper dibuat acak saat migrasi dan tidak ada di repo.
create table private.config (
  key   text primary key,
  value text not null
);
revoke all on private.config from public, anon, authenticated;
insert into private.config (key, value)
values ('pin_pepper', encode(extensions.gen_random_bytes(32), 'hex'));

create or replace function private.pin_hash(p_pin text)
returns text
language sql stable security definer set search_path = ''
as $$
  select encode(
    extensions.hmac(p_pin, (select value from private.config where key = 'pin_pepper'), 'sha256'),
    'hex');
$$;
revoke execute on function private.pin_hash(text) from public, anon, authenticated;

create table private.login_attempts (
  id      bigint generated always as identity primary key,
  ip      text,
  success boolean not null,
  at      timestamptz not null default now()
);
revoke all on private.login_attempts from public, anon, authenticated;
create index login_attempts_ip_at_idx on private.login_attempts (ip, at desc);
create index login_attempts_failed_at_idx on private.login_attempts (at desc) where not success;

-- ── Helper RLS (membaca role) ──────────────────────────────────
create or replace function private.my_kind()
returns text
language sql stable security definer set search_path = ''
as $$
  select r.kind from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = (select auth.uid()) and p.active;
$$;

create or replace function private.my_collection()
returns text
language sql stable security definer set search_path = ''
as $$
  select collection_name from public.profiles
  where id = (select auth.uid()) and active;
$$;

create or replace function private.is_sa()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.my_kind() = 'sa', false);
$$;

create or replace function private.has_menu(p_submenu text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_sa() or exists (
    select 1 from public.profiles p
    join public.role_menus m on m.role_id = p.role_id
    where p.id = (select auth.uid()) and p.active and m.submenu_id = p_submenu
  );
$$;

revoke execute on function private.my_kind() from public, anon;
revoke execute on function private.my_collection() from public, anon;
grant execute on function private.my_kind() to authenticated;
grant execute on function private.my_collection() to authenticated;

-- ── Login & pengaturan PIN (hanya dipanggil server dengan service role) ──
-- Proteksi brute-force: ruang PIN hanya 1 juta kombinasi.
create or replace function public.pin_login(p_pin text, p_ip text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user  uuid;
  v_email text;
begin
  if (select count(*) from private.login_attempts
        where not success and ip = p_ip and at > now() - interval '15 minutes') >= 5
     or (select count(*) from private.login_attempts
        where not success and at > now() - interval '10 minutes') >= 50 then
    return jsonb_build_object('status', 'locked');
  end if;

  if p_pin ~ '^\d{6}$' then
    select id, email into v_user, v_email
    from public.profiles
    where pin_hash = private.pin_hash(p_pin) and active;
  end if;

  insert into private.login_attempts (ip, success) values (p_ip, v_user is not null);

  if v_user is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  return jsonb_build_object('status', 'ok', 'user_id', v_user, 'email', v_email);
end;
$$;

create or replace function public.admin_set_pin(p_user uuid, p_pin text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_pin !~ '^\d{6}$' then
    raise exception 'PIN harus 6 digit angka' using errcode = '22023';
  end if;
  update public.profiles set pin_hash = private.pin_hash(p_pin) where id = p_user;
  if not found then
    raise exception 'Akun tidak ditemukan' using errcode = 'P0002';
  end if;
exception
  when unique_violation then
    raise exception 'PIN sudah dipakai akun lain' using errcode = '23505';
end;
$$;

revoke execute on function public.pin_login(text, text) from public, anon, authenticated;
revoke execute on function public.admin_set_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.pin_login(text, text) to service_role;
grant execute on function public.admin_set_pin(uuid, text) to service_role;

-- ── Tutup pendaftaran publik ─────────────────────────────────────
-- Akun hanya bisa dibuat lewat Admin API (Super Admin), yang menyetel
-- app_metadata.provisioned = true. signUp dengan anon key ditolak.
create or replace function private.guard_auth_signup()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'provisioned', '') <> 'true' then
    raise exception 'Akun hanya dapat dibuat oleh Super Admin';
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_auth_signup() from public, anon, authenticated;

create trigger guard_auth_signup
  before insert on auth.users
  for each row execute function private.guard_auth_signup();

-- ── RLS ──────────────────────────────────────────────────────────
alter table public.roles      enable row level security;
alter table public.role_menus enable row level security;

create policy "baca role" on public.roles
  for select to authenticated using (true);
create policy "sa tambah role" on public.roles
  for insert to authenticated with check (private.is_sa());
create policy "sa ubah role" on public.roles
  for update to authenticated using (private.is_sa()) with check (private.is_sa());
create policy "sa hapus role" on public.roles
  for delete to authenticated using (private.is_sa());

create policy "baca menu role" on public.role_menus
  for select to authenticated using (true);
create policy "sa tambah menu role" on public.role_menus
  for insert to authenticated with check (private.is_sa());
create policy "sa hapus menu role" on public.role_menus
  for delete to authenticated using (private.is_sa());

-- 0001_core: akun, akses menu (ACL), pengaturan, log import.
-- Login hanya lewat Google. Email @penguin.id otomatis diterima; email lain
-- harus terdaftar di email_allowlist (mis. kurir tanpa akun penguin.id).

create table public.email_allowlist (
  email      text primary key check (email = lower(email)),
  kind       text not null default 'user' check (kind in ('sa','ctrl','coll','kurir','user')),
  note       text,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null unique,
  display_name    text,
  -- sa = Super Admin, ctrl = Controller, coll = Collection, kurir = kolektor tukar faktur
  kind            text not null default 'user' check (kind in ('sa','ctrl','coll','kurir','user')),
  role            text,             -- mis. 'Manager', 'Supervisor' (dulu CTRL_LIST.role)
  collection_name text,             -- nama persis seperti kolom Collection Name di data tagihan
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ID submenu sama dengan MENU_REGISTRY aplikasi lama ('dash.coll', 'tukar.upload', ...).
-- Deny-by-default: user hanya melihat submenu yang tercatat di sini. Super Admin melihat semua.
create table public.menu_acl (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  submenu_id text not null,
  primary key (user_id, submenu_id)
);

create table public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table public.import_log (
  id        bigint generated always as identity primary key,
  module    text not null,
  kind      text not null,
  file_name text,
  months    text[],
  rows      integer,
  user_id   uuid references public.profiles(id) on delete set null default auth.uid(),
  at        timestamptz not null default now()
);
create index import_log_module_at_idx on public.import_log (module, at desc);
create index import_log_user_id_idx on public.import_log (user_id);

-- ── Helper untuk RLS ──────────────────────────────────────────────
create or replace function public.is_sa()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and kind = 'sa' and active
  );
$$;

create or replace function public.has_menu(p_submenu text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_sa() or exists (
    select 1 from public.menu_acl a
    join public.profiles p on p.id = a.user_id and p.active
    where a.user_id = (select auth.uid()) and a.submenu_id = p_submenu
  );
$$;

revoke execute on function public.is_sa() from anon, public;
revoke execute on function public.has_menu(text) from anon, public;
grant execute on function public.is_sa() to authenticated;
grant execute on function public.has_menu(text) to authenticated;

-- ── Pendaftaran user baru ────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(new.email);
  v_allow public.email_allowlist%rowtype;
begin
  select * into v_allow from public.email_allowlist where email = v_email;

  if v_email not like '%@penguin.id' and v_allow.email is null then
    raise exception 'Email % tidak diizinkan. Gunakan akun @penguin.id.', v_email;
  end if;

  insert into public.profiles (id, email, display_name, kind)
  values (
    new.id,
    v_email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', v_email),
    coalesce(v_allow.kind, 'user')
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from anon, authenticated, public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── RLS ───────────────────────────────────────────────────────────
alter table public.email_allowlist enable row level security;
alter table public.profiles        enable row level security;
alter table public.menu_acl        enable row level security;
alter table public.app_settings    enable row level security;
alter table public.import_log      enable row level security;

create policy "sa kelola allowlist" on public.email_allowlist
  for all to authenticated using (public.is_sa()) with check (public.is_sa());

create policy "lihat profil sendiri atau sa" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or public.is_sa());
create policy "sa ubah profil" on public.profiles
  for update to authenticated using (public.is_sa()) with check (public.is_sa());
create policy "sa hapus profil" on public.profiles
  for delete to authenticated using (public.is_sa());

create policy "lihat acl sendiri atau sa" on public.menu_acl
  for select to authenticated using (user_id = (select auth.uid()) or public.is_sa());
create policy "sa tambah acl" on public.menu_acl
  for insert to authenticated with check (public.is_sa());
create policy "sa hapus acl" on public.menu_acl
  for delete to authenticated using (public.is_sa());

create policy "baca pengaturan" on public.app_settings
  for select to authenticated using (true);
create policy "sa tulis pengaturan" on public.app_settings
  for all to authenticated using (public.is_sa()) with check (public.is_sa());

create policy "baca log import" on public.import_log
  for select to authenticated using (true);
create policy "catat log import sendiri" on public.import_log
  for insert to authenticated with check (user_id = (select auth.uid()));

-- ── Data awal ────────────────────────────────────────────────────
insert into public.email_allowlist (email, kind, note)
values ('jobforkids@gmail.com', 'sa', 'Super Admin awal');

insert into public.app_settings (key, value) values
  ('wa_template', jsonb_build_object(
     'header', 'Halo, saya dari *PENGUIN Trading* ingin memberitahukan rincian tagihan Anda :',
     'footer', E'Mohon konfirmasi pembayaran anda dengan membalas pesan ini atau melalui email ar@penguin.id\nTerimakasih,\n\n*{{collection}}*')),
  ('mitra10_tax_name', to_jsonb('Catur Mitra Sejati Sentosa'::text));

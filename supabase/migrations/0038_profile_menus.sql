-- 0038: Fase 33 — Akses menu PER AKUN. profile_menus = menu yang boleh dibuka tiap akun (diatur Super Admin di
-- Akun & PIN). role_menus tetap ada sebagai DEFAULT: disalin ke akun baru (trigger) dan saat Super Admin memilih
-- "ganti dengan default role baru". Mengubah default role tidak mengubah akun lama. Super Admin tetap semua menu.

create table public.profile_menus (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  submenu_id text not null,
  primary key (user_id, submenu_id)
);
alter table public.profile_menus enable row level security;

create policy "baca menu akun sendiri atau sa" on public.profile_menus
  for select to authenticated using (user_id = (select auth.uid()) or private.is_sa());
create policy "sa tambah menu akun" on public.profile_menus
  for insert to authenticated with check (private.is_sa());
create policy "sa hapus menu akun" on public.profile_menus
  for delete to authenticated using (private.is_sa());

-- Backfill: akses setiap akun sama persis dengan role-nya saat ini.
insert into public.profile_menus (user_id, submenu_id)
select p.id, m.submenu_id
from public.profiles p
join public.role_menus m on m.role_id = p.role_id
on conflict do nothing;

-- Akun baru (form Akun & PIN maupun skrip) otomatis mendapat default menu role-nya.
create or replace function private.profile_menus_default()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profile_menus (user_id, submenu_id)
  select new.id, m.submenu_id from public.role_menus m where m.role_id = new.role_id
  on conflict do nothing;
  return new;
end;
$$;
revoke execute on function private.profile_menus_default() from public, anon, authenticated;

create trigger profile_menus_default
  after insert on public.profiles
  for each row execute function private.profile_menus_default();

-- Semua RPC/paket memakai has_menu → kini membaca menu akun.
create or replace function private.has_menu(p_submenu text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_sa() or exists (
    select 1 from public.profiles p
    join public.profile_menus m on m.user_id = p.id
    where p.id = (select auth.uid()) and p.active and m.submenu_id = p_submenu
  );
$$;

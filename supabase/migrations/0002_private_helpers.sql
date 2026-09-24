-- 0002: pindahkan helper RLS ke schema private (tidak diekspos lewat REST /rpc),
-- pecah policy app_settings supaya SELECT hanya dievaluasi satu policy.

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_sa()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and kind = 'sa' and active
  );
$$;

create or replace function private.has_menu(p_submenu text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_sa() or exists (
    select 1 from public.menu_acl a
    join public.profiles p on p.id = a.user_id and p.active
    where a.user_id = (select auth.uid()) and a.submenu_id = p_submenu
  );
$$;

revoke execute on function private.is_sa() from anon, public;
revoke execute on function private.has_menu(text) from anon, public;
grant execute on function private.is_sa() to authenticated;
grant execute on function private.has_menu(text) to authenticated;

-- Ganti semua policy agar memakai private.is_sa()
drop policy "sa kelola allowlist" on public.email_allowlist;
create policy "sa kelola allowlist" on public.email_allowlist
  for all to authenticated using (private.is_sa()) with check (private.is_sa());

drop policy "lihat profil sendiri atau sa" on public.profiles;
drop policy "sa ubah profil" on public.profiles;
drop policy "sa hapus profil" on public.profiles;
create policy "lihat profil sendiri atau sa" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or private.is_sa());
create policy "sa ubah profil" on public.profiles
  for update to authenticated using (private.is_sa()) with check (private.is_sa());
create policy "sa hapus profil" on public.profiles
  for delete to authenticated using (private.is_sa());

drop policy "lihat acl sendiri atau sa" on public.menu_acl;
drop policy "sa tambah acl" on public.menu_acl;
drop policy "sa hapus acl" on public.menu_acl;
create policy "lihat acl sendiri atau sa" on public.menu_acl
  for select to authenticated using (user_id = (select auth.uid()) or private.is_sa());
create policy "sa tambah acl" on public.menu_acl
  for insert to authenticated with check (private.is_sa());
create policy "sa hapus acl" on public.menu_acl
  for delete to authenticated using (private.is_sa());

drop policy "sa tulis pengaturan" on public.app_settings;
create policy "sa tambah pengaturan" on public.app_settings
  for insert to authenticated with check (private.is_sa());
create policy "sa ubah pengaturan" on public.app_settings
  for update to authenticated using (private.is_sa()) with check (private.is_sa());
create policy "sa hapus pengaturan" on public.app_settings
  for delete to authenticated using (private.is_sa());

create index app_settings_updated_by_idx on public.app_settings (updated_by);

drop function public.has_menu(text);
drop function public.is_sa();

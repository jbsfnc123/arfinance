-- 0004: perbaiki guard pendaftaran.
-- Admin API (auth.admin.createUser) meng-insert user dulu, lalu mengisi app_metadata
-- di transaksi yang sama. Trigger BEFORE INSERT belum melihat 'provisioned' sehingga
-- akun sah ikut ditolak. Pemeriksaan dipindah ke constraint trigger yang ditunda ke
-- akhir transaksi dan membaca ulang baris final.

drop trigger if exists guard_auth_signup on auth.users;

create or replace function private.guard_auth_signup()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from auth.users
    where id = new.id and raw_app_meta_data ->> 'provisioned' = 'true'
  ) then
    raise exception 'Akun hanya dapat dibuat oleh Super Admin';
  end if;
  return null;
end;
$$;
revoke execute on function private.guard_auth_signup() from public, anon, authenticated;

create constraint trigger guard_auth_signup
  after insert on auth.users
  deferrable initially deferred
  for each row execute function private.guard_auth_signup();

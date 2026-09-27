-- 0036: Fase 31 — login tanpa PIN (cukup nama) untuk akun yang dicentang Super Admin + domain kolektor.tangki.space.
-- Akun ber-role Super Admin TIDAK boleh tanpa PIN (pengambilalihan penuh sistem). Batas percobaan login sama dengan
-- pin_login_named. name_login hanya untuk service role (dipanggil server action login).

alter table public.profiles add column if not exists pin_optional boolean not null default false;

-- Pengaman: role Super Admin tidak boleh tanpa PIN (dicek saat profil diubah maupun saat role-nya diganti).
create or replace function private.guard_pin_optional()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.pin_optional and exists (select 1 from public.roles r where r.id = new.role_id and r.kind = 'sa') then
    raise exception 'Akun Super Admin wajib memakai PIN' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_pin_optional on public.profiles;
create trigger guard_pin_optional before insert or update of pin_optional, role_id on public.profiles
  for each row execute function private.guard_pin_optional();

-- Login cukup nama: ok (akun aktif, pin_optional, bukan SA) | need_pin (nama ada tetapi wajib PIN) | invalid | locked.
create or replace function public.name_login(p_name text, p_ip text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid; v_email text; v_exists boolean;
begin
  if (select count(*) from private.login_attempts
        where not success and ip = p_ip and at > now() - interval '15 minutes') >= 5
     or (select count(*) from private.login_attempts
        where not success and at > now() - interval '10 minutes') >= 50 then
    return jsonb_build_object('status', 'locked');
  end if;

  if char_length(btrim(coalesce(p_name, ''))) > 0 then
    select p.id, p.email into v_user, v_email
    from public.profiles p join public.roles r on r.id = p.role_id
    where p.active and p.pin_optional and r.kind <> 'sa'
      and lower(btrim(p.display_name)) = lower(btrim(p_name));
    if v_user is null then
      select exists (select 1 from public.profiles
                     where active and lower(btrim(display_name)) = lower(btrim(p_name))) into v_exists;
      if v_exists then
        return jsonb_build_object('status', 'need_pin'); -- bukan percobaan gagal: lanjut ke langkah PIN
      end if;
    end if;
  end if;

  insert into private.login_attempts (ip, success) values (p_ip, v_user is not null);
  if v_user is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  return jsonb_build_object('status', 'ok', 'user_id', v_user, 'email', v_email);
end;
$$;
revoke all on function public.name_login(text, text) from public, anon, authenticated;
grant execute on function public.name_login(text, text) to service_role;

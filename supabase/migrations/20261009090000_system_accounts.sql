-- Fase 55: akun sistem (mis. "Bot ERP") untuk otomasi upload Aging dari PC lokal.
-- Akun sistem login hanya lewat email + password turunan (supabase-js di bot), TIDAK lewat halaman login:
-- tidak tampil di daftar nama dan ditolak oleh name_login / pin_login_named / pin_setup_named.
-- Hak akses tetap lewat menu akun (profile_menus), mis. hanya set.update (Pusat Upload).

alter table public.profiles add column if not exists system_account boolean not null default false;

create or replace function public.name_login(p_name text, p_ip text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid; v_email text; v_kind text; v_optional boolean; v_has_pin boolean;
begin
  if (select count(*) from private.login_attempts
        where not success and ip = p_ip and at > now() - interval '15 minutes') >= 5
     or (select count(*) from private.login_attempts
        where not success and at > now() - interval '10 minutes') >= 50 then
    return jsonb_build_object('status', 'locked');
  end if;

  if char_length(btrim(coalesce(p_name, ''))) > 0 then
    select p.id, p.email, r.kind, p.pin_optional, p.pin_hash is not null
      into v_user, v_email, v_kind, v_optional, v_has_pin
    from public.profiles p join public.roles r on r.id = p.role_id
    where p.active and not p.system_account and lower(btrim(p.display_name)) = lower(btrim(p_name))
    order by p.created_at limit 1;
    if v_user is not null and not (v_kind = 'kurir' and v_optional) then
      -- Selain kolektor: wajib PIN; belum punya PIN → buat dulu.
      return jsonb_build_object('status', case when v_has_pin then 'need_pin' else 'need_setup' end);
    end if;
  end if;

  insert into private.login_attempts (ip, success) values (p_ip, v_user is not null);
  if v_user is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  return jsonb_build_object('status', 'ok', 'user_id', v_user, 'email', v_email);
end;
$$;

create or replace function public.pin_login_named(p_name text, p_pin text, p_ip text)
returns jsonb
language plpgsql security definer set search_path = ''
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

  if p_pin ~ '^\d{6}$' and char_length(btrim(coalesce(p_name, ''))) > 0 then
    select id, email into v_user, v_email
    from public.profiles
    where pin_hash = private.pin_hash(p_pin) and active and not system_account
      and lower(btrim(display_name)) = lower(btrim(p_name));
  end if;

  insert into private.login_attempts (ip, success) values (p_ip, v_user is not null);

  if v_user is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  return jsonb_build_object('status', 'ok', 'user_id', v_user, 'email', v_email);
end;
$$;

create or replace function public.pin_setup_named(p_name text, p_pin text, p_ip text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_user uuid; v_email text;
begin
  if (select count(*) from private.login_attempts
        where not success and ip = p_ip and at > now() - interval '15 minutes') >= 5
     or (select count(*) from private.login_attempts
        where not success and at > now() - interval '10 minutes') >= 50 then
    return jsonb_build_object('status', 'locked');
  end if;
  if coalesce(p_pin, '') !~ '^\d{6}$' then
    return jsonb_build_object('status', 'invalid_pin');
  end if;
  update public.profiles p set pin_hash = private.pin_hash(p_pin)
  where p.active and not p.system_account and p.pin_hash is null
    and lower(btrim(p.display_name)) = lower(btrim(coalesce(p_name, '')))
    and p.id = (select p2.id from public.profiles p2
                where p2.active and not p2.system_account and lower(btrim(p2.display_name)) = lower(btrim(coalesce(p_name, '')))
                order by p2.created_at limit 1)
  returning p.id, p.email into v_user, v_email;
  insert into private.login_attempts (ip, success) values (p_ip, v_user is not null);
  if v_user is null then return jsonb_build_object('status', 'invalid'); end if;
  return jsonb_build_object('status', 'ok', 'user_id', v_user, 'email', v_email);
end;
$$;

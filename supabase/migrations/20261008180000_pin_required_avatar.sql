-- Fase 54 (keputusan user 2026-10-08):
-- * Login tanpa PIN dihapus, KECUALI akun kolektor (role kurir) di Aplikasi Kolektor.
-- * Akun tanpa PIN wajib membuat PIN saat login pertama (pin_setup_named).
-- * Ganti PIN sendiri dari menu profil (change_my_pin).
-- * Foto profil: kolom profiles.avatar_path + bucket privat "avatars" (folder per akun).
-- Kebijakan Realtime alarm (20261006191613) dibiarkan; fitur Alarm dihapus dari aplikasi.

-- ══ LOGIN ══════════════════════════════════════════════════════════
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
    where p.active and lower(btrim(p.display_name)) = lower(btrim(p_name))
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

-- Buat PIN pertama kali (dipanggil server action login dengan service role). Hanya akun aktif yang BELUM punya PIN.
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
  where p.active and p.pin_hash is null and lower(btrim(p.display_name)) = lower(btrim(coalesce(p_name, '')))
    and p.id = (select p2.id from public.profiles p2 where p2.active and lower(btrim(p2.display_name)) = lower(btrim(coalesce(p_name, '')))
                order by p2.created_at limit 1)
  returning p.id, p.email into v_user, v_email;
  insert into private.login_attempts (ip, success) values (p_ip, v_user is not null);
  if v_user is null then return jsonb_build_object('status', 'invalid'); end if;
  return jsonb_build_object('status', 'ok', 'user_id', v_user, 'email', v_email);
end;
$$;
revoke execute on function public.pin_setup_named(text, text, text) from public, anon, authenticated;
grant execute on function public.pin_setup_named(text, text, text) to service_role;

-- Ganti PIN sendiri. PIN lama wajib bila akun sudah punya PIN. Kegagalan masuk hitungan batas percobaan.
create or replace function public.change_my_pin(p_old text, p_new text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_hash text; v_key text;
begin
  if v_uid is null then return jsonb_build_object('status', 'denied'); end if;
  v_key := 'pin:' || v_uid::text;
  if (select count(*) from private.login_attempts where not success and ip = v_key and at > now() - interval '15 minutes') >= 5 then
    return jsonb_build_object('status', 'locked');
  end if;
  if coalesce(p_new, '') !~ '^\d{6}$' then return jsonb_build_object('status', 'invalid_new'); end if;
  select pin_hash into v_hash from public.profiles where id = v_uid and active;
  if not found then return jsonb_build_object('status', 'denied'); end if;
  if v_hash is not null and (coalesce(p_old, '') !~ '^\d{6}$' or private.pin_hash(p_old) <> v_hash) then
    insert into private.login_attempts (ip, success) values (v_key, false);
    return jsonb_build_object('status', 'wrong_old');
  end if;
  if v_hash is not null and private.pin_hash(p_new) = v_hash then return jsonb_build_object('status', 'same'); end if;
  update public.profiles set pin_hash = private.pin_hash(p_new) where id = v_uid;
  insert into private.login_attempts (ip, success) values (v_key, true);
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke execute on function public.change_my_pin(text, text) from public, anon;
grant execute on function public.change_my_pin(text, text) to authenticated;

-- "Login tanpa PIN" kini hanya bermakna untuk kolektor.
update public.profiles p set pin_optional = false
from public.roles r where r.id = p.role_id and r.kind <> 'kurir' and p.pin_optional;

-- ══ FOTO PROFIL ════════════════════════════════════════════════════
alter table public.profiles add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "foto profil sendiri: baca" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "foto profil sendiri: unggah" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "foto profil sendiri: ubah" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "foto profil sendiri: hapus" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function public.set_my_avatar(p_path text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Akses ditolak' using errcode = '42501'; end if;
  if p_path is not null and (p_path !~ ('^' || auth.uid()::text || '/[A-Za-z0-9._-]{1,80}$')) then
    raise exception 'Path foto tidak valid' using errcode = '22023';
  end if;
  update public.profiles set avatar_path = p_path where id = auth.uid();
end;
$$;
revoke execute on function public.set_my_avatar(text) from public, anon;
grant execute on function public.set_my_avatar(text) to authenticated;

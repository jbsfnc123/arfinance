-- 0026: Fase 17 — satu pintu login di tangki.space, divisi AR/AP per akun, login Nama + PIN.

-- Divisi akun menentukan workspace: ar → ar.tangki.space, ap → ap.tangki.space,
-- both → pilih di tangki.space. Super Admin selalu semua (diatur di kode). Hanya SA yang mengubah
-- (kolom profiles hanya ditulis lewat admin client di aksi Akun & PIN).
alter table public.profiles
  add column division text not null default 'ar' check (division in ('ar', 'ap', 'both'));

-- Model lama (centang workspace per role, Fase 16) diganti divisi per akun.
delete from public.role_menus where submenu_id in ('ws.ar', 'ws.ap');

-- ── Saran nama di halaman login ─────────────────────────────────
-- Publik (sebelum login) lewat server action + service role: min. 2 huruf, maks. 5 nama akun aktif,
-- dibatasi 30 permintaan/menit per IP.
create table private.name_lookups (
  id bigint generated always as identity primary key,
  ip text not null,
  at timestamptz not null default now()
);
revoke all on private.name_lookups from public, anon, authenticated;
create index name_lookups_ip_at_idx on private.name_lookups (ip, at desc);

create or replace function public.login_names(p_q text, p_ip text)
returns text[]
language plpgsql volatile security definer set search_path = ''
as $$
declare v_q text := btrim(coalesce(p_q, ''));
begin
  if char_length(v_q) < 2 then return '{}'; end if;
  delete from private.name_lookups where at < now() - interval '1 hour';
  if (select count(*) from private.name_lookups where ip = p_ip and at > now() - interval '1 minute') >= 30 then
    return '{}';
  end if;
  insert into private.name_lookups (ip) values (p_ip);
  return coalesce((
    select array_agg(n order by n) from (
      select distinct display_name as n from public.profiles
      where active and display_name ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      order by display_name limit 5) s), '{}');
end;
$$;

-- ── Login Nama + PIN ────────────────────────────────────────────
create or replace function public.pin_login_named(p_name text, p_pin text, p_ip text)
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

  if p_pin ~ '^\d{6}$' and char_length(btrim(coalesce(p_name, ''))) > 0 then
    select id, email into v_user, v_email
    from public.profiles
    where pin_hash = private.pin_hash(p_pin) and active
      and lower(btrim(display_name)) = lower(btrim(p_name));
  end if;

  insert into private.login_attempts (ip, success) values (p_ip, v_user is not null);

  if v_user is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  return jsonb_build_object('status', 'ok', 'user_id', v_user, 'email', v_email);
end;
$$;

revoke execute on function public.login_names(text, text) from public, anon, authenticated;
revoke execute on function public.pin_login_named(text, text, text) from public, anon, authenticated;
grant execute on function public.login_names(text, text) to service_role;
grant execute on function public.pin_login_named(text, text, text) to service_role;

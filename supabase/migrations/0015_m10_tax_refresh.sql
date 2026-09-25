-- 0015: m10_aging kini view atas snapshot aging bersama; mengganti Tax Name langsung berlaku,
-- jadi invoice baru untuk Tax Name tersebut ikut ditambahkan ke Kertas Kerja saat itu juga.
create or replace function public.m10_set_tax_name(p_value text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.has_menu('rek.mitra10') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if nullif(trim(p_value), '') is null then
    raise exception 'Tax Name tidak boleh kosong' using errcode = '22023';
  end if;
  insert into public.app_settings (key, value, updated_by)
  values ('m10_tax_name', to_jsonb(trim(p_value)), (select auth.uid()))
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  return private.m10_append_from_aging();
end;
$$;

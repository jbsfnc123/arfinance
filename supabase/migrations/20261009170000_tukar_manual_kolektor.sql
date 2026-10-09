-- Fase 58: Daftar Tagihan › Tukar Faktur "Via Kolektor" — cadangan bila kolektor lupa update di Aplikasi Kolektor.
-- Staff collection mencatat manual (tanpa foto) dan hasilnya SAMA seperti update kolektor: courier_updates Done
-- (Jadwal Kolektor, Laporan Harian, Recent Tukar; keluar dari daftar pending kolektor) + invoice_exchanges 'Kolektor'
-- (status Tukar Faktur di Daftar Tagihan / Dashboard). Ditandai "Input manual oleh <nama staff>".

-- Nama kolektor (akun role Kurir aktif) untuk pilihan di Daftar Tagihan.
create or replace function public.kolektor_names()
returns table(name text)
language sql stable security definer set search_path = ''
as $$
  select p.display_name from public.profiles p
  join public.roles r on r.id = p.role_id
  where r.kind = 'kurir' and p.active and not p.system_account
    and (private.has_menu('coll.tagihan') or private.can_see_tukar())
  order by 1;
$$;
revoke execute on function public.kolektor_names() from public, anon;
grant execute on function public.kolektor_names() to authenticated;

create or replace function public.tukar_manual_kolektor(p_invoices text[], p_tanggal date, p_kurir text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_kurir text;
  v_staff text := coalesce(nullif(trim(private.my_name()), ''), 'staff');
  v_kode  text := to_char(now() at time zone 'Asia/Jakarta', 'DD-MM-YY-HH24MISS');
  v_total integer;
  v_count integer;
begin
  if not private.has_menu('coll.tagihan') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if p_tanggal is null or p_tanggal > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal tukar faktur wajib diisi dan tidak boleh di masa depan' using errcode = '22023';
  end if;
  select p.display_name into v_kurir from public.profiles p join public.roles r on r.id = p.role_id
  where r.kind = 'kurir' and p.active and not p.system_account and lower(btrim(p.display_name)) = lower(btrim(coalesce(p_kurir, '')))
  limit 1;
  if v_kurir is null then
    raise exception 'Nama kolektor tidak dikenal' using errcode = '22023';
  end if;
  v_total := cardinality(array(select distinct btrim(x) from unnest(coalesce(p_invoices, '{}')) x where btrim(x) <> ''));
  if v_total = 0 or v_total > 1000 then
    raise exception 'Pilih 1–1.000 invoice' using errcode = '22023';
  end if;

  -- Invoice yang boleh dilihat & belum Done di courier_updates (yang sudah Done dilewati, tidak dobel).
  with sel as (
    select distinct on (a.invoice_no) a.invoice_no, a.collection_name,
           coalesce(s.business_partner, a.business_partner) as business_partner,
           coalesce(s.invoice_date, a.invoice_date) as invoice_date,
           coalesce(s.open_amt, a.open_amt, 0) as open_amt
    from unnest(p_invoices) i(inv)
    join public.ar_invoices a on a.invoice_no = btrim(i.inv)
    left join public.courier_schedules s on s.invoice_no = a.invoice_no
    where private.can_see_collection(a.collection_name)
      and not exists (select 1 from public.courier_updates u where u.invoice_no = a.invoice_no and u.status = 'Done')
    order by a.invoice_no
  ), cu as (
    insert into public.courier_updates
      (invoice_no, business_partner, invoice_date, open_amt, tanggal_tukar, status, keterangan, kode, foto_path, kurir)
    select invoice_no, business_partner, invoice_date, open_amt, p_tanggal, 'Done', 'Input manual oleh ' || v_staff, v_kode, null, v_kurir
    from sel
    returning invoice_no
  ), ex as (
    insert into public.invoice_exchanges (invoice_no, metode, tanggal, keterangan, foto_path, kurir, collection_name)
    select invoice_no, 'Kolektor', p_tanggal, v_kode, null, v_kurir, collection_name from sel
    returning invoice_no
  )
  select count(*) into v_count from cu;

  return jsonb_build_object('count', v_count, 'skipped', v_total - v_count, 'kode', case when v_count > 0 then v_kode end,
    'kurir', v_kurir, 'staff', v_staff);
end;
$$;
revoke execute on function public.tukar_manual_kolektor(text[], date, text) from public, anon;
grant execute on function public.tukar_manual_kolektor(text[], date, text) to authenticated;

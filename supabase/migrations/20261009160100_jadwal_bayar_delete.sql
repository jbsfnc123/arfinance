-- Fase 58 (lanjutan): hapus Jadwal Bayar Mitra10 per No KW juga menghapus salinannya di field Jadwal Bayar terpadu
-- (payment_promises source mitra10, ref = No KW). Jadwal Bayar yang diisi manual di Daftar Tagihan tidak tersentuh.
create or replace function public.m10_schedule_delete(p_no_kw text[])
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not private.has_menu('rek.mitra10') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  delete from public.m10_payment_schedule where no_kw = any(p_no_kw);
  get diagnostics v_count = row_count;
  delete from public.payment_promises where source = 'mitra10' and ref = any(p_no_kw);
  return v_count;
end;
$$;

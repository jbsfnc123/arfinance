-- Perbaikan 20261021090000: private.pack hanya mengirim kolom yang tercantum di array nama kolom, jadi invoice_no juga harus
-- masuk array itu (migrasi sebelumnya hanya menambah kolom di select). Aman dijalankan ulang.

do $$
declare
  v_def text; v_new text;
begin
  select pg_get_functiondef('public.pack_tukar()'::regprocedure) into v_def;
  if position('''business_partner'', ''invoice_no''' in v_def) > 0 then
    raise notice 'pack_tukar sudah mengirim invoice_no';
    return;
  end if;
  v_new := replace(v_def, 'select tanggal_tukar, kurir, business_partner, kode from public.courier_updates',
                          'select tanggal_tukar, kurir, business_partner, invoice_no, kode from public.courier_updates');
  v_new := replace(v_new, 'array[''tanggal_tukar'', ''kurir'', ''business_partner'', ''kode'']',
                          'array[''tanggal_tukar'', ''kurir'', ''business_partner'', ''invoice_no'', ''kode'']');
  if position('''business_partner'', ''invoice_no''' in v_new) = 0 or position('business_partner, invoice_no, kode' in v_new) = 0 then
    raise exception 'pack_tukar: teks select / daftar kolom tidak ditemukan';
  end if;
  execute v_new;
end $$;

update public.data_versions set updated_at = now() where key = 'tukar';

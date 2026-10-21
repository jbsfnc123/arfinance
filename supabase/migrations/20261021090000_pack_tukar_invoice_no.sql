-- Fase 69: Export Detail Laporan Kolektor butuh No Invoice per baris Done → pack_tukar ikut mengirim invoice_no.
-- Diubah lewat penggantian teks yang dicek (pola 0034) agar cek akses yang sudah ada tidak tersentuh.
-- Versi data 'tukar' dinaikkan supaya cache IndexedDB lama (tanpa invoice_no) dimuat ulang.

do $$
declare
  v_def text; v_new text;
begin
  select pg_get_functiondef('public.pack_tukar()'::regprocedure) into v_def;
  v_new := replace(v_def, 'select tanggal_tukar, kurir, business_partner, kode from public.courier_updates',
                          'select tanggal_tukar, kurir, business_partner, invoice_no, kode from public.courier_updates');
  if v_new = v_def then
    raise exception 'pack_tukar: teks select tidak ditemukan';
  end if;
  execute v_new;
end $$;

update public.data_versions set updated_at = now() where key = 'tukar';

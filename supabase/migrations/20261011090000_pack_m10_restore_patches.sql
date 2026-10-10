-- Fase 66 tahap 1: 20261009160000_jadwal_bayar.sql mendefinisikan ulang pack_m10 dengan `create or replace` sehingga dua patch
-- teks sebelumnya hilang. Terapkan ulang (idempoten):
--   1. 0034: pengguna menu Dashboard Tukar Faktur (dash.tukar) boleh membaca paket m10;
--   2. 20261007145618: worksheet hanya baris yang SJ-nya ada di Aging aktif (paket tidak membawa riwayat lunas).
do $$
declare d text;
begin
  select pg_get_functiondef('public.pack_m10()'::regprocedure) into d;
  if position('has_menu(''dash.tukar'')' in d) = 0 then
    if position('if not private.has_menu(''rek.mitra10'') then' in d) = 0 then raise exception 'pack_m10: baris akses tidak ditemukan'; end if;
    d := replace(d, 'if not private.has_menu(''rek.mitra10'') then',
      'if not (private.has_menu(''rek.mitra10'') or private.has_menu(''dash.tukar'')) then');
  end if;
  if position('from public.m10_worksheet w where exists' in d) = 0 then
    if position('from public.m10_worksheet order by id' in d) = 0 then raise exception 'pack_m10: proyeksi worksheet tidak ditemukan'; end if;
    d := replace(d, 'from public.m10_worksheet order by id',
      'from public.m10_worksheet w where exists (select 1 from public.m10_aging a where upper(trim(a.no_sj)) = upper(trim(w.no_sj)) and length(trim(a.invoice_no)) > 0) order by id');
  end if;
  execute d;
end $$;
update public.data_versions set updated_at = now() where key = 'm10';

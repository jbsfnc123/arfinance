-- 0034: Fase 30 — Dashboard Tukar Faktur (Mitra10, RKM, Modern Market, Proyek) & Laporan & Jadwal Kolektor.
-- Pengguna menu Dashboard Tukar Faktur (dash.tukar) membaca paket m10, rkm, aging (semua collection — kecuali akun
-- collection, tetap terbatas), activity (catatan tukar faktur) & remarks. Laporan Harian kolektor pindah ke menu
-- Laporan & Jadwal Kolektor (tukar.jadwal) → pack_tukar juga untuk menu itu. Diubah lewat penggantian teks yang dicek.

do $$
declare
  v_def text; v_new text;
  r record;
begin
  for r in select * from (values
    ('public.pack_m10()', 'if not private.has_menu(''rek.mitra10'') then',
                          'if not (private.has_menu(''rek.mitra10'') or private.has_menu(''dash.tukar'')) then'),
    ('public.pack_rkm()', 'if not private.has_menu(''tukar.rkm'') then',
                          'if not (private.has_menu(''tukar.rkm'') or private.has_menu(''dash.tukar'')) then'),
    ('public.pack_tukar()', 'if not private.has_menu(''dash.tukar'') then',
                            'if not (private.has_menu(''dash.tukar'') or private.has_menu(''tukar.jadwal'')) then'),
    ('public.pack_aging()', 'or private.has_menu(''lap.presentasi'');',
                            'or private.has_menu(''lap.presentasi'')
    or (v_kind is distinct from ''coll'' and private.has_menu(''dash.tukar''));'),
    ('public.pack_activity()', '  elsif v_kind = ''coll'' then v_where := format(''collection_name = %L'', coalesce(private.my_collection(), ''''));',
                               '  elsif v_kind = ''coll'' then v_where := format(''collection_name = %L'', coalesce(private.my_collection(), ''''));
  elsif private.has_menu(''dash.tukar'') then v_where := ''true'';'),
    ('public.pack_remarks()', 'or private.has_menu(''inv.hold'') or private.has_menu(''inv.pengajuan'') then',
                              'or private.has_menu(''inv.hold'') or private.has_menu(''inv.pengajuan'')
     or (private.my_kind() is distinct from ''coll'' and private.has_menu(''dash.tukar'')) then')
  ) as t(fn, old_txt, new_txt) loop
    select pg_get_functiondef(r.fn::regprocedure) into v_def;
    v_new := replace(v_def, r.old_txt, r.new_txt);
    if v_new = v_def then
      raise exception '%: teks akses tidak ditemukan', r.fn;
    end if;
    execute v_new;
  end loop;
end $$;

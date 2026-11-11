-- Fase 76: Kuitansi Date Mitra10 = Tgl Tukar Faktur di Daftar Tagihan.
-- pack_activity() 'exchanges' = invoice_exchanges + baris VIRTUAL per invoice dari m10_kwitansi (metode 'Kwitansi EDI',
-- tanggal = Kuitansi Date paling awal, id negatif → tidak tersimpan & tidak bisa diubah). Klien (pickExchanges) menaruh
-- 'Kwitansi EDI' di prioritas terakhir, sehingga tukar faktur Kolektor/Ekspedisi/Sistem/WA/Email tetap menang.
-- Hanya Kwitansi 12 bulan terakhir (payload pack tetap kecil). Akses tidak berubah.
create or replace function public.pack_activity()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
declare v_kind text := private.my_kind(); v_where text;
begin
  if v_kind in ('sa', 'ctrl', 'coll') then v_where := 'true';
  elsif v_kind = 'coll' then v_where := format('collection_name = %L', coalesce(private.my_collection(), ''));
  elsif private.has_menu('dash.tukar') or private.has_menu('tukar.ekspedisi') then v_where := 'true';
  else raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'notes', private.pack('select id, invoice_no, kategori, business_partner, isi, collection_name, invoice_date, no_po, no_sj,
                                  done, closed_by, closed_at, created_at from public.notes where ' || v_where || ' order by id',
      array['id', 'invoice_no', 'kategori', 'business_partner', 'isi', 'collection_name', 'invoice_date', 'no_po', 'no_sj',
            'done', 'closed_by', 'closed_at', 'created_at']),
    'promises', private.pack('select id, invoice_no, business_partner, collection_name, promise_date, isi, created_at
                                from public.payment_promises where ' || v_where || ' order by id',
      array['id', 'invoice_no', 'business_partner', 'collection_name', 'promise_date', 'isi', 'created_at']),
    'exchanges', private.pack('select id, invoice_no, metode, tanggal, keterangan, resi, foto_path, kurir, collection_name from (
                                 select id, invoice_no, metode, tanggal, keterangan, resi, foto_path, kurir, collection_name
                                 from public.invoice_exchanges where ' || v_where || '
                                 union all
                                 select -min(k.id), k.vendor_invoice_no, ''Kwitansi EDI'', min(k.kuitansi_date),
                                        ''Kuitansi '' || string_agg(distinct k.kuitansi_no, '', ''), null, null, null, null
                                 from public.m10_kwitansi k
                                 where nullif(trim(k.vendor_invoice_no), '''') is not null and k.kuitansi_date is not null
                                   and k.kuitansi_date >= (now() at time zone ''Asia/Jakarta'')::date - 365
                                 group by k.vendor_invoice_no
                               ) x order by id',
      array['id', 'invoice_no', 'metode', 'tanggal', 'keterangan', 'resi', 'foto_path', 'kurir', 'collection_name']));
end;
$function$;

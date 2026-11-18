-- Fase 81: Dashboard Tukar Faktur per metode (Kolektor, Ekspedisi, EDI Mitra10) + ringkasan bulanan nominal yang sudah TF.
-- Satu baris per invoice yang sudah tukar faktur:
--   * metode terpilih = prioritas Kolektor > Ekspedisi > Sistem > WA > Email > Kwitansi EDI (sama dengan pickExchanges klien),
--     tanggal = tanggal tukar paling awal untuk metode itu;
--   * EDI Mitra10 = m10_kwitansi (tanggal = Kuitansi Date paling awal, nominal = total_net semua baris invoice itu);
--   * nominal metode lain = erp_invoices.amount, cadangan jumlah open_amt invoice di snapshot Aging terbaru yang memuatnya
--     (invoice lunas hilang dari Aging terbaru, jadi semua snapshot dipakai). Tanpa keduanya → nominal null.
-- Akses: menu Dashboard Tukar Faktur (sama dengan pack_tukar). Tidak mengubah data.
create or replace function public.pack_tf_summary()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if not (private.has_menu('dash.tukar') or private.my_kind() in ('sa', 'ctrl')) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return jsonb_build_object('rows', private.pack($q$
    with ex as (
      select invoice_no, metode, tanggal, kurir, resi, collection_name, null::text as kuitansi, null::numeric as edi_amt
      from public.invoice_exchanges
      where tanggal is not null and nullif(trim(invoice_no), '') is not null
      union all
      select k.vendor_invoice_no, 'Kwitansi EDI', min(k.kuitansi_date), null, null, null,
             string_agg(distinct k.kuitansi_no, ', '), sum(k.total_net)
      from public.m10_kwitansi k
      where nullif(trim(k.vendor_invoice_no), '') is not null and k.kuitansi_date is not null
      group by k.vendor_invoice_no
    ),
    pick as (
      select distinct on (invoice_no) *
      from ex
      order by invoice_no,
        array_position(array['Kolektor', 'Ekspedisi', 'Sistem', 'WA', 'Email', 'Kwitansi EDI'], metode) nulls last, tanggal
    ),
    ag as (
      select distinct on (l.invoice_no) l.invoice_no, l.amt, l.business_partner, l.invoice_date, l.collection_name
      from (
        select a.snapshot_id, a.invoice_no, sum(a.open_amt) amt, min(a.business_partner) business_partner,
               min(a.invoice_date) invoice_date, min(a.collection_name) collection_name
        from public.ar_aging_lines a
        where a.invoice_no in (select invoice_no from pick)
        group by a.snapshot_id, a.invoice_no
      ) l
      join public.ar_aging_snapshots s on s.id = l.snapshot_id
      order by l.invoice_no, s.created_at desc
    )
    select p.invoice_no, p.metode, p.tanggal,
           case when p.metode = 'Kwitansi EDI' then p.edi_amt else coalesce(e.amount, ag.amt) end as nominal,
           coalesce(e.bp_name, ag.business_partner) as business_partner,
           coalesce(e.invoice_date, ag.invoice_date) as invoice_date,
           coalesce(p.collection_name, ag.collection_name) as collection_name,
           p.kurir, p.resi, p.kuitansi
    from pick p
    left join public.erp_invoices e on e.invoice_no = p.invoice_no
    left join ag on ag.invoice_no = p.invoice_no
    order by p.tanggal, p.invoice_no
  $q$, array['invoice_no', 'metode', 'tanggal', 'nominal', 'business_partner', 'invoice_date', 'collection_name', 'kurir', 'resi', 'kuitansi']));
end;
$function$;

revoke all on function public.pack_tf_summary() from public, anon;
grant execute on function public.pack_tf_summary() to authenticated;

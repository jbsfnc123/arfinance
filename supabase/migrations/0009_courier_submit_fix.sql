-- 0009: courier_submit aman dipanggil berulang dalam satu transaksi/koneksi
-- (tabel sementara _sel dibuang dulu bila masih ada).
create or replace function public.courier_submit(
  p_invoices jsonb,
  p_tanggal date,
  p_ket_done text,
  p_ket_pending text,
  p_foto_path text,
  p_kurir text
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_kind  text := private.my_kind();
  v_kurir text;
  v_kode  text;
  v_count integer;
  v_done  integer;
begin
  if not (v_kind in ('sa', 'ctrl', 'kurir') and private.has_menu('tukar.detail')) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if p_tanggal is null then
    raise exception 'Tanggal diterima wajib diisi' using errcode = '22023';
  end if;
  v_kurir := case when v_kind = 'kurir' then private.my_name() else nullif(trim(p_kurir), '') end;
  if v_kurir is null then
    raise exception 'Nama kurir wajib diisi' using errcode = '22023';
  end if;

  drop table if exists pg_temp._sel;
  create temp table _sel on commit drop as
  select s.*, coalesce(x.done, false) as done
  from jsonb_to_recordset(p_invoices) as x(invoice_no text, done boolean)
  join public.courier_schedules s on s.invoice_no = x.invoice_no
  where not exists (select 1 from public.courier_updates u where u.invoice_no = s.invoice_no);

  select count(*), count(*) filter (where done) into v_count, v_done from _sel;
  if v_count = 0 then
    raise exception 'Invoice sudah diproses atau tidak ada di jadwal' using errcode = '22023';
  end if;
  if v_done > 0 and nullif(trim(p_foto_path), '') is null then
    raise exception 'Foto tanda terima wajib untuk invoice Done' using errcode = '22023';
  end if;

  v_kode := case when v_done > 0 then to_char(now() at time zone 'Asia/Jakarta', 'DD-MM-YY-HH24MISS') end;

  insert into public.courier_updates
    (invoice_no, business_partner, invoice_date, open_amt, tanggal_tukar, status, keterangan, kode, foto_path, kurir)
  select invoice_no, business_partner, invoice_date, open_amt, p_tanggal,
         case when done then 'Done' else 'Pending' end,
         nullif(trim(case when done then p_ket_done else p_ket_pending end), ''),
         case when done then v_kode end,
         case when done then p_foto_path end,
         v_kurir
  from _sel;

  insert into public.invoice_exchanges
    (invoice_no, metode, tanggal, keterangan, foto_path, kurir, collection_name)
  select s.invoice_no, 'Kolektor', p_tanggal, v_kode, p_foto_path, v_kurir, a.collection_name
  from _sel s left join public.ar_invoices a on a.invoice_no = s.invoice_no
  where s.done;

  return jsonb_build_object('count', v_count, 'done', v_done, 'kode', v_kode, 'kurir', v_kurir);
end;
$$;

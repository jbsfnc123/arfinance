-- 0037: Fase 32 — Tukar Faktur › Ekspedisi. Invoice dipilih dari aging terbaru lalu dicatat No Resi + tanggal kirim
-- sebagai tukar faktur metode 'Ekspedisi' (invoice_exchanges) → kolom Tgl Tukar Faktur & No Resi di Daftar Tagihan
-- terisi. Satu baris Ekspedisi per invoice (simpan ulang = ganti resi/tanggal). Akses: menu tukar.ekspedisi.

create or replace function private.ekspedisi_check(p_resi text, p_tanggal date)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare v_resi text := nullif(trim(p_resi), '');
begin
  if not private.has_menu('tukar.ekspedisi') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if v_resi is null then
    raise exception 'No Resi wajib diisi' using errcode = '22023';
  end if;
  if length(v_resi) > 60 then
    raise exception 'No Resi maksimal 60 karakter' using errcode = '22023';
  end if;
  if p_tanggal is null then
    raise exception 'Tanggal tukar faktur wajib diisi' using errcode = '22023';
  end if;
  if p_tanggal > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal tukar faktur tidak boleh melebihi hari ini' using errcode = '22023';
  end if;
  return v_resi;
end;
$$;
revoke execute on function private.ekspedisi_check(text, date) from public, anon;
grant execute on function private.ekspedisi_check(text, date) to authenticated;

create or replace function public.ekspedisi_save(p_invoices text[], p_resi text, p_tanggal date)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_resi text := private.ekspedisi_check(p_resi, p_tanggal);
  v_n integer;
begin
  drop table if exists pg_temp._eks;
  create temp table _eks on commit drop as
  select distinct on (c.invoice_no) c.invoice_no, c.collection_name
  from public.v_aging_current c
  where c.invoice_no in (select trim(x) from unnest(p_invoices) as x)
  order by c.invoice_no, c.line_no;

  select count(*) into v_n from _eks;
  if v_n = 0 then
    raise exception 'Invoice tidak ditemukan di aging terbaru' using errcode = '22023';
  end if;

  update public.invoice_exchanges e
  set resi = v_resi, tanggal = p_tanggal, keterangan = null
  from _eks s
  where e.invoice_no = s.invoice_no and e.metode = 'Ekspedisi';

  insert into public.invoice_exchanges (invoice_no, metode, tanggal, resi, collection_name)
  select s.invoice_no, 'Ekspedisi', p_tanggal, v_resi, s.collection_name
  from _eks s
  where not exists (select 1 from public.invoice_exchanges e where e.invoice_no = s.invoice_no and e.metode = 'Ekspedisi');

  return v_n;
end;
$$;

create or replace function public.ekspedisi_edit(p_ids bigint[], p_resi text, p_tanggal date)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_resi text := private.ekspedisi_check(p_resi, p_tanggal);
  v_n integer;
begin
  update public.invoice_exchanges
  set resi = v_resi, tanggal = p_tanggal, keterangan = null
  where id = any (p_ids) and metode = 'Ekspedisi';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.ekspedisi_delete(p_ids bigint[])
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_n integer;
begin
  if not private.has_menu('tukar.ekspedisi') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  delete from public.invoice_exchanges where id = any (p_ids) and metode = 'Ekspedisi';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.ekspedisi_save(text[], text, date) from public, anon;
revoke execute on function public.ekspedisi_edit(bigint[], text, date) from public, anon;
revoke execute on function public.ekspedisi_delete(bigint[]) from public, anon;
grant execute on function public.ekspedisi_save(text[], text, date) to authenticated;
grant execute on function public.ekspedisi_edit(bigint[], text, date) to authenticated;
grant execute on function public.ekspedisi_delete(bigint[]) to authenticated;

-- ── Paket data: menu Ekspedisi membaca aging (semua collection, kecuali akun collection) & activity ──
do $$
declare
  v_def text; v_new text;
  r record;
begin
  for r in select * from (values
    ('public.pack_aging()', 'or (v_kind is distinct from ''coll'' and private.has_menu(''dash.tukar''));',
                            'or (v_kind is distinct from ''coll'' and (private.has_menu(''dash.tukar'') or private.has_menu(''tukar.ekspedisi'')));'),
    ('public.pack_activity()', '  elsif private.has_menu(''dash.tukar'') then v_where := ''true'';',
                               '  elsif private.has_menu(''dash.tukar'') or private.has_menu(''tukar.ekspedisi'') then v_where := ''true'';')
  ) as t(fn, old_txt, new_txt) loop
    select pg_get_functiondef(r.fn::regprocedure) into v_def;
    v_new := replace(v_def, r.old_txt, r.new_txt);
    if v_new = v_def then
      raise exception '%: teks akses tidak ditemukan', r.fn;
    end if;
    execute v_new;
  end loop;
end $$;

-- ── Akses menu awal: role Controller (Super Admin otomatis) ──
insert into public.role_menus (role_id, submenu_id)
select r.id, 'tukar.ekspedisi' from public.roles r
where r.kind = 'ctrl'
  and not exists (select 1 from public.role_menus m where m.role_id = r.id and m.submenu_id = 'tukar.ekspedisi');

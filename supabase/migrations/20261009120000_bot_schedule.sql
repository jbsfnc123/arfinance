-- Fase 56: Bot ERP mengunggah Jadwal Tukar Faktur (laporan Jaspersoft "Send Invoice To Customer").
-- schedule_replace sebelumnya mewajibkan role Controller/Super Admin (is_ctrl) + menu tukar.upload. Akun sistem
-- (profiles.system_account, Fase 55) berrole Collection → kini juga boleh, tetap WAJIB menu tukar.upload.
-- Isi fungsi lain tidak berubah (ganti seluruh jadwal + import_log tukar_faktur/jadwal).

create or replace function private.is_system_account()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active and p.system_account);
$$;
revoke execute on function private.is_system_account() from public, anon;
grant execute on function private.is_system_account() to authenticated;

create or replace function public.schedule_replace(p_rows jsonb, p_file_name text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not ((private.is_ctrl() or private.is_system_account()) and private.has_menu('tukar.upload')) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;

  delete from public.courier_schedules where true;
  insert into public.courier_schedules
    (invoice_no, payment_group, marketing, business_partner, invoice_date, open_amt, send_date)
  select distinct on (r.invoice_no)
    r.invoice_no,
    coalesce(nullif(trim(r.payment_group), ''), a.payment_group, 'Tanpa Grup'),
    coalesce(nullif(trim(r.marketing), ''), a.marketing, '-'),
    r.business_partner,
    r.invoice_date,
    coalesce(r.open_amt, a.open_amt, 0),
    r.send_date
  from jsonb_to_recordset(p_rows) as r(
    invoice_no text, payment_group text, marketing text, business_partner text,
    invoice_date date, open_amt numeric, send_date date)
  left join public.ar_invoices a on a.invoice_no = r.invoice_no
  where nullif(trim(r.invoice_no), '') is not null and r.send_date is not null
  order by r.invoice_no;
  get diagnostics v_count = row_count;

  insert into public.import_log (module, kind, file_name, rows, user_id)
  values ('tukar_faktur', 'jadwal', p_file_name, v_count, (select auth.uid()));
  return v_count;
end;
$$;

-- Akun sistem "Bot ERP": tambah akses Upload Jadwal.
insert into public.profile_menus (user_id, submenu_id)
select p.id, 'tukar.upload' from public.profiles p
where p.system_account and p.display_name = 'Bot ERP'
on conflict do nothing;

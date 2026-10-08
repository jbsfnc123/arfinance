-- Fase 57: Bot ERP mengunggah Laporan Serah Terima Surat Jalan (Monitor SJ) lewat sj_receipts_apply yang sudah ada
-- (insert-only: SJ yang sudah punya Receive Date tidak ditimpa, data lama tidak dihapus).
-- sj_can_manage sebelumnya: menu tukar.monitor_sj + role Controller/Super Admin. Kini akun sistem (Fase 55) juga boleh,
-- tetap WAJIB menu tukar.monitor_sj.

create or replace function private.sj_can_manage()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.has_menu('tukar.monitor_sj')
    and (coalesce(private.my_kind() in ('sa', 'ctrl'), false) or private.is_system_account());
$$;

-- Akun sistem "Bot ERP": akses Monitor Surat Jalan (baca daftar Receiver + upload penerimaan).
insert into public.profile_menus (user_id, submenu_id)
select p.id, 'tukar.monitor_sj' from public.profiles p
where p.system_account and p.display_name = 'Bot ERP'
on conflict do nothing;

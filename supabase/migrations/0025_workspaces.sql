-- 0025: Fase 16 — akses workspace per role (ws.ar = ar.tangki.space, ws.ap = ap.tangki.space).
-- Finance Workspace (tangki.space) khusus Super Admin, tanpa entri di sini.
-- Semua role lama tetap bisa membuka AR; AP belum diberikan ke siapa pun.
insert into public.role_menus (role_id, submenu_id)
select id, 'ws.ar' from public.roles where kind <> 'sa'
on conflict do nothing;

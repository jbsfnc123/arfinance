-- 0010: invoice jadwal yang belum dikunjungi kurir (Done/Pending belum tercatat).
create view public.v_courier_pending
with (security_invoker = true) as
select s.*
from public.courier_schedules s
where not exists (select 1 from public.courier_updates u where u.invoice_no = s.invoice_no);

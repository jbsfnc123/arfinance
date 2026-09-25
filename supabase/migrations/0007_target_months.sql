-- 0007: daftar bulan target (pemilih bulan di Dashboard Collection).
create view public.v_target_months
with (security_invoker = true) as
select month, count(*) as invoices, sum(target) as total
from public.ar_targets
group by month;

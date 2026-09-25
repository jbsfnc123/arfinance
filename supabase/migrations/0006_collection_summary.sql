-- 0006: daftar collection (untuk pemilih di halaman Collection) + PK tabel staging.

create view public.v_collection_summary
with (security_invoker = true) as
select collection_name, count(*) as invoices, sum(open_amt) as total
from public.ar_invoices
where open_amt > 1000 and collection_name is not null and collection_name <> ''
group by collection_name;

alter table private.ar_invoices_staging
  add column id bigint generated always as identity primary key;

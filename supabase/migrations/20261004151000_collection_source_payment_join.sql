-- Avoid repeated scanning of the invoice CTE for each ERP payment.
-- The distinct invoice relation makes this join preserve payment multiplicity.
alter function private.collection_sj_parts(text) rows 4;

create or replace function private.collection_source(p_month text,p_cutoff date) returns jsonb
language sql stable security definer set search_path = '' as $$
 with targets as materialized (
   select month,invoice_no,target,marketing,collection_name,business_partner,due_date,branch,no_sj
   from public.ar_targets where month=p_month
 ), ag as materialized (
   select coalesce((select aging_data from public.collection_periods where month=p_month),
     private.collection_aging((select id from public.ar_aging_snapshots order by month desc limit 1))) a
 ), sj as materialized (
   select distinct s from targets t cross join lateral private.collection_sj_parts(t.no_sj) s
 ), all_lines as materialized (
   select l from ag cross join lateral jsonb_array_elements(coalesce(a->'lines','[]'::jsonb)) l
 ), lines as materialized (
   select l from all_lines join targets t on t.invoice_no=l->>'invoice_no'
   union
   select l from all_lines cross join lateral private.collection_sj_parts(l->>'no_sj') part(value)
     join sj on sj.s=part.value
 ), invoices as materialized (
   select invoice_no from targets union select l->>'invoice_no' from lines
 )
 select jsonb_build_object('schemaVersion',1,'month',p_month,'cutoff',p_cutoff,
   'aging',(select (a-'lines') || jsonb_build_object('lines',coalesce((select jsonb_agg(l order by (l->>'line_no')::int) from lines),'[]'::jsonb)) from ag),
   'targets',coalesce((select jsonb_agg(to_jsonb(t) order by t.invoice_no) from targets t),'[]'::jsonb),
   'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.invoice_no,p.payment_date) from (
      select e.invoice_no,e.payment_date,sum(e.amount) amount from public.erp_payments e
      left join invoices i on i.invoice_no=e.invoice_no
      where (payment_date >= (p_month||'-01')::date and payment_date < (p_month||'-01')::date + interval '1 month')
         or i.invoice_no is not null
      group by e.invoice_no,e.payment_date
    ) p),'[]'::jsonb),
   'notes',coalesce((select jsonb_agg(to_jsonb(n) order by n.id) from (
      select id,invoice_no,kategori from public.notes where kategori='Case'
    ) n),'[]'::jsonb),
   'promises',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from (
      select distinct on (invoice_no) id,invoice_no,promise_date from public.payment_promises
      where invoice_no in (select invoice_no from targets) order by invoice_no,id desc
    ) p),'[]'::jsonb),
   'settings',coalesce((select jsonb_object_agg(key,value) from public.app_settings where key='collection_filter'),'{}'::jsonb))
$$;


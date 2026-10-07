-- Store only previous values of changed source columns, never full Aging copies.
create table private.m10_aging_changes (
  id bigint generated always as identity primary key,
  worksheet_id bigint not null,
  changed_at timestamptz not null default now(),
  previous_values jsonb not null check (previous_values <> '{}'::jsonb)
);
alter table private.m10_aging_changes enable row level security;
revoke all on private.m10_aging_changes from public, anon, authenticated;

-- Keep the existing signature: callers expect the number of NEW worksheet rows.
create or replace function private.m10_append_from_aging()
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_changes jsonb;
  v_new integer := 0;
  v_skipped integer;
begin
  -- Serialize worksheet writers; readers remain available. No delete/reinsert.
  lock table public.m10_worksheet in share row exclusive mode;
  with source as materialized (
    select upper(trim(a.no_sj)) sj, min(a.id) first_id,
      jsonb_build_object('payment_group',a.payment_group,'business_partner',a.business_partner,
        'invoice_no',a.invoice_no,'invoice_date',a.invoice_date,'due_date',a.due_date,
        'open_amt',a.open_amt,'branch',a.branch,'no_po',a.no_po) data
    from public.m10_aging a
    where nullif(trim(a.no_sj),'') is not null
    group by upper(trim(a.no_sj)), a.payment_group,a.business_partner,a.invoice_no,
      a.invoice_date,a.due_date,a.open_amt,a.branch,a.no_po
  ), source_counts as (
    select sj, count(*) n from source group by sj
  ), worksheet_keys as (
    select upper(trim(no_sj)) sj, count(*) n, min(id) id
    from public.m10_worksheet group by upper(trim(no_sj))
  ), candidates as (
    select w.id, s.sj, s.data, d.previous_values
    from source s join source_counts c on c.sj=s.sj and c.n=1
    left join worksheet_keys k on k.sj=s.sj
    left join public.m10_worksheet w on w.id=k.id
    cross join lateral (
      select coalesce(jsonb_object_agg(e.key,to_jsonb(w)->e.key),'{}'::jsonb) previous_values
      from jsonb_each(s.data) e where e.value is distinct from to_jsonb(w)->e.key
    ) d
    where coalesce(k.n,0)<=1 and nullif(trim(s.data->>'invoice_no'),'') is not null
      and (w.id is null or d.previous_values <> '{}'::jsonb)
  )
  select (select jsonb_agg(to_jsonb(c)) from candidates c),
    (select count(*) from source_counts c left join worksheet_keys k using(sj)
      where c.n>1 or coalesce(k.n,0)>1)
  into v_changes,v_skipped;

  if v_skipped>0 then
    raise warning 'Mitra10: % ambiguous SJ skipped; review duplicate Aging/worksheet rows',v_skipped;
  end if;
  if v_changes is null then return 0; end if;

  if exists(select 1 from jsonb_array_elements(v_changes) c where c->>'id' is not null) then
    insert into private.m10_aging_changes(worksheet_id,previous_values)
    select (c->>'id')::bigint,c->'previous_values'
    from jsonb_array_elements(v_changes) c where c->>'id' is not null;

    update public.m10_worksheet w set
      payment_group=r.payment_group,business_partner=r.business_partner,invoice_no=r.invoice_no,
      invoice_date=r.invoice_date,due_date=r.due_date,open_amt=r.open_amt,branch=r.branch,no_po=r.no_po
    from jsonb_array_elements(v_changes) c
    cross join lateral jsonb_populate_record(null::public.m10_worksheet,c->'data') r
    where w.id=(c->>'id')::bigint;
  end if;
  if exists(select 1 from jsonb_array_elements(v_changes) c where c->>'id' is null) then
    insert into public.m10_worksheet(payment_group,business_partner,invoice_no,invoice_date,due_date,open_amt,branch,no_po,no_sj)
    select r.payment_group,r.business_partner,r.invoice_no,r.invoice_date,r.due_date,r.open_amt,r.branch,r.no_po,c->>'sj'
    from jsonb_array_elements(v_changes) c
    cross join lateral jsonb_populate_record(null::public.m10_worksheet,c->'data') r
    where c->>'id' is null;
    get diagnostics v_new = row_count;
  end if;
  return v_new;
end;
$$;
revoke execute on function private.m10_append_from_aging() from public, anon, authenticated;

-- Correct existing rows atomically using exactly the same path as future uploads.
select private.m10_append_from_aging();

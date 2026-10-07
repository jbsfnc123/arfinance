-- Omit inactive invoice payloads, preserving stable IDs and all linked metadata.
-- No deletion of historical anchors or closed Collection snapshots.
do $$
declare d text;
begin
  select pg_get_functiondef('public.pack_m10()'::regprocedure) into d;
  if position('from public.m10_worksheet order by id' in d)=0 then
    raise exception 'pack_m10 worksheet projection hook not found';
  end if;
  d := replace(d,'from public.m10_worksheet order by id',
    'from public.m10_worksheet w where exists (select 1 from public.m10_aging a where upper(trim(a.no_sj)) = upper(trim(w.no_sj)) and length(trim(a.invoice_no)) > 0) order by id');
  execute d;
end $$;
-- Existing clients must discard cached historical worksheet packets once.
update public.data_versions set updated_at=now() where key='m10';

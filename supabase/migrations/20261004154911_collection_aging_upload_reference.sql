-- Bind an Open period to its durable Aging snapshot without copying all 22k rows
-- inside the upload transaction. The full compact projection is copied on close.
do $$
declare d text;
begin
  select pg_get_functiondef('public.aging_commit(uuid)'::regprocedure) into d;
  if position('aging_data=private.collection_aging(v_snap)' in d)=0 then
    raise exception 'aging_commit projection hook not found';
  end if;
  d:=replace(d,'aging_data=private.collection_aging(v_snap)',
    'aging_data=jsonb_build_object(''snapshotId'',v_snap,''asOf'',v_as_of,''verified'',true,''fileName'',b.file_name,''uploadedAt'',now())');
  if position('where id <> v_snap and id not in (select id from public.ar_aging_snapshots order by month desc limit 2);' in d)=0 then
    raise exception 'aging_commit retention hook not found';
  end if;
  d:=replace(d,
    'where id <> v_snap and id not in (select id from public.ar_aging_snapshots order by month desc limit 2);',
    'where id <> v_snap and id not in (select id from public.ar_aging_snapshots order by month desc limit 2)
      and not exists (select 1 from public.collection_periods p
        where p.status=''open'' and (p.aging_data->>''snapshotId'')::bigint=public.ar_aging_snapshots.id);');
  execute d;

  select pg_get_functiondef('private.collection_source(text,date)'::regprocedure) into d;
  if position('select coalesce((select aging_data from public.collection_periods where month=p_month),' in d)=0 then
    raise exception 'collection_source binding hook not found';
  end if;
  d:=replace(d,
    'select coalesce((select aging_data from public.collection_periods where month=p_month),',
    'select coalesce((select case when aging_data ? ''lines'' then aging_data
      else private.collection_aging((aging_data->>''snapshotId'')::bigint) end
      from public.collection_periods where month=p_month),');
  execute d;

  select pg_get_functiondef('public.collection_close(text,date,text,integer,boolean)'::regprocedure) into d;
  if position('aging_data=coalesce(aging_data,private.collection_aging(' in d)=0 then
    raise exception 'collection_close projection hook not found';
  end if;
  d:=replace(d,
    'aging_data=coalesce(aging_data,private.collection_aging((select id from public.ar_aging_snapshots order by month desc limit 1)))',
    'aging_data=case when aging_data ? ''lines'' then aging_data
      else private.collection_aging(coalesce((aging_data->>''snapshotId'')::bigint,
        (select id from public.ar_aging_snapshots order by month desc limit 1))) end');
  execute d;
end $$;

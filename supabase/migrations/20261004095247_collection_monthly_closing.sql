-- Monthly Collection closing. Additive: no automatic closing or target rewrites.
-- Snapshots own their minimal source data; aging retention cannot delete history.
create table public.collection_periods (
  month text primary key check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status text not null default 'open' check (status in ('open','closed')),
  revision integer not null default 0,
  aging_data jsonb,
  updated_at timestamptz not null default now()
);
create table public.collection_closings (
  id bigint generated always as identity primary key,
  month text not null references public.collection_periods(month),
  revision integer not null,
  cutoff date not null,
  source jsonb not null,
  source_hash text not null,
  closed_at timestamptz not null default now(),
  closed_by uuid not null references public.profiles(id),
  unique(month, revision)
);
create index collection_closings_closed_by_idx on public.collection_closings(closed_by);
create table public.collection_closing_log (
  id bigint generated always as identity primary key,
  month text not null references public.collection_periods(month),
  revision integer not null,
  action text not null check (action in ('close','reopen')),
  reason text,
  at timestamptz not null default now(),
  actor uuid not null references public.profiles(id)
);
create index collection_closing_log_month_idx on public.collection_closing_log(month,id desc);
create index collection_closing_log_actor_idx on public.collection_closing_log(actor);
-- Explicitly no direct API writes; all transitions validate access in RPCs.
alter table public.collection_periods enable row level security;
alter table public.collection_closings enable row level security;
alter table public.collection_closing_log enable row level security;
revoke all on public.collection_periods, public.collection_closings, public.collection_closing_log from public, anon, authenticated;
insert into public.collection_periods(month) select distinct month from public.ar_targets;
insert into public.data_versions(key) values ('collection_closing') on conflict do nothing;
create trigger bump_collection_periods after insert or update or delete on public.collection_periods
for each statement execute function private.bump_version('collection_closing');

alter table public.ar_aging_snapshots add column report_date date;
comment on column public.ar_aging_snapshots.report_date is 'Explicit date supplied by uploader. NULL = legacy date inferred from invoice dates.';

create function private.collection_month(p_month text) returns date
language plpgsql immutable set search_path = '' as $$
begin
  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Bulan harus YYYY-MM yang valid' using errcode='22023';
  end if;
  return (p_month || '-01')::date;
end $$;

create function private.collection_read_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and private.has_menu('dash.coll')
$$;
create function private.collection_manage_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and private.is_ctrl() and private.has_menu('dash.coll')
$$;

-- Protect every target mutation, including old clients/RPCs. Lock the same period as close/reopen.
create function private.collection_target_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m text; s text;
begin
  for m in select distinct x from unnest(case when tg_op='INSERT' then array[new.month::text]
    when tg_op='DELETE' then array[old.month::text] else array[old.month::text,new.month::text] end) x order by x
  loop
    select status into s from public.collection_periods where month=m for update;
    if not found then
      insert into public.collection_periods(month) values(m) on conflict do nothing;
      select status into s from public.collection_periods where month=m for update;
    end if;
    if s='closed' then raise exception 'Target bulan % sudah Closed. Buka kembali periode terlebih dahulu.',m using errcode='55000'; end if;
  end loop;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger collection_target_guard before insert or update or delete on public.ar_targets
for each row execute function private.collection_target_guard();
create function private.collection_no_truncate() returns trigger
language plpgsql set search_path = '' as $$ begin
 raise exception 'TRUNCATE tidak diizinkan untuk data closing/target' using errcode='55000';
end $$;
create trigger collection_target_no_truncate before truncate on public.ar_targets
for each statement execute function private.collection_no_truncate();
create function private.collection_immutable() returns trigger
language plpgsql set search_path = '' as $$ begin
 raise exception 'Riwayat closing bersifat permanen; buat versi baru melalui Buka Kembali' using errcode='55000';
end $$;
create trigger collection_snapshot_immutable before update or delete on public.collection_closings
for each row execute function private.collection_immutable();
create trigger collection_snapshot_no_truncate before truncate on public.collection_closings
for each statement execute function private.collection_no_truncate();
create trigger collection_log_immutable before update or delete on public.collection_closing_log
for each row execute function private.collection_immutable();
create trigger collection_log_no_truncate before truncate on public.collection_closing_log
for each statement execute function private.collection_no_truncate();

create function private.collection_sj_parts(s text) returns setof text
language sql immutable set search_path = '' as $$
 select distinct btrim(x,'- ,;' || chr(9) || chr(10) || chr(13))
 from regexp_split_to_table(upper(trim(coalesce(s,''))), '(?=SJ/)') x
 where btrim(x,'- ,;' || chr(9) || chr(10) || chr(13)) <> ''
$$;

-- Small projection, independent of the disposable aging snapshot's lifetime.
create function private.collection_aging(p_snapshot bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('snapshotId',s.id,'asOf',coalesce(s.report_date,s.as_of),
   'verified',s.report_date is not null,'fileName',s.file_name,'uploadedAt',s.created_at,
   'lines',coalesce((select jsonb_agg(to_jsonb(l) order by l.line_no) from (
     select line_no,invoice_no,payment_group,marketing,collection_name,business_partner,bp_key,
       invoice_date,due_date,open_amt,no_po,no_sj
     from public.ar_aging_lines where snapshot_id=s.id
   ) l),'[]'::jsonb))
 from public.ar_aging_snapshots s where s.id=p_snapshot
$$;

-- One stable SQL statement supplies a consistent MVCC snapshot to previews/readers.
-- Closing holds SHARE locks on the source tables until this payload is durably saved.
create function private.collection_source(p_month text,p_cutoff date) returns jsonb
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
      select invoice_no,payment_date,sum(amount) amount from public.erp_payments
      where (payment_date >= (p_month||'-01')::date and payment_date < (p_month||'-01')::date + interval '1 month')
         or invoice_no in (select invoice_no from invoices)
      group by invoice_no,payment_date
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

create function public.collection_period_get(p_month text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p public.collection_periods; c public.collection_closings; src jsonb;
begin
 if not private.collection_read_allowed() then raise exception 'Akses ditolak' using errcode='42501'; end if;
 perform private.collection_month(p_month);
 select * into p from public.collection_periods where month=p_month;
 if p.status='closed' then
   select * into c from public.collection_closings where month=p_month and revision=p.revision;
   if c.id is null then raise exception 'Snapshot closing tidak ditemukan'; end if;
   src:=c.source;
 else src:=private.collection_source(p_month,(now() at time zone 'Asia/Jakarta')::date); end if;
 return jsonb_build_object('month',p_month,'status',coalesce(p.status,'open'),'revision',coalesce(p.revision,0),
   'canManage',private.collection_manage_allowed(),'canReopen',private.is_sa(),'source',src,
   'closedAt',c.closed_at,'closedBy',c.closed_by,
   'months',(select coalesce(jsonb_agg(month order by month desc),'[]'::jsonb) from (select distinct month::text from public.ar_targets union select month from public.collection_periods) m),
   'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.id desc),'[]'::jsonb) from (
      select id,revision,action,reason,at,actor from public.collection_closing_log where month=p_month order by id desc limit 50) h));
end $$;

create function public.collection_closing_preview(p_month text,p_cutoff date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare src jsonb; first_day date; rev int;
begin
 if not private.collection_manage_allowed() then raise exception 'Akses ditolak' using errcode='42501'; end if;
 first_day:=private.collection_month(p_month);
 if p_cutoff is null or p_cutoff <> (first_day + interval '1 month - 1 day')::date
   or p_cutoff > (now() at time zone 'Asia/Jakarta')::date then
   raise exception 'Cut off harus akhir bulan yang sudah berlalu' using errcode='22023'; end if;
 if exists(select 1 from public.collection_periods where month=p_month and status='closed') then
   raise exception 'Periode sudah Closed' using errcode='55000'; end if;
 src:=private.collection_source(p_month,p_cutoff);
 if jsonb_array_length(src->'targets')=0 then raise exception 'Target bulan ini belum tersedia'; end if;
 if src->'aging' is null or src->'aging'='null'::jsonb then raise exception 'Aging belum tersedia'; end if;
 if (src#>>'{aging,asOf}')::date <> p_cutoff then
   raise exception 'Aging harus merupakan laporan posisi tanggal %. Upload laporan akhir bulan tersebut.',p_cutoff; end if;
 select coalesce(revision,0) into rev from public.collection_periods where month=p_month;
 return jsonb_build_object('source',src,'token',md5(src::text),'revision',coalesce(rev,0));
end $$;

create function public.collection_close(p_month text,p_cutoff date,p_token text,p_revision integer,p_confirm_source boolean) returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare preview jsonb; p public.collection_periods; result_id bigint;
begin
 if not private.collection_manage_allowed() then raise exception 'Akses ditolak' using errcode='42501'; end if;
 if p_confirm_source is distinct from true then raise exception 'Konfirmasi tanggal laporan Aging diperlukan'; end if;
 perform private.collection_month(p_month);
 -- Source-table locks first, then period row: uploads take source-table locks before period guards too.
 lock table public.ar_targets,public.ar_aging_snapshots,public.ar_aging_lines,public.erp_payments,
   public.notes,public.payment_promises,public.app_settings in share mode;
 insert into public.collection_periods(month) values(p_month) on conflict do nothing;
 select * into p from public.collection_periods where month=p_month for update;
 -- Safe retry after lost HTTP acknowledgement. It cannot create a second revision.
 if p.status='closed' then
   select id into result_id from public.collection_closings where month=p_month and revision=p.revision
     and source_hash=p_token and cutoff=p_cutoff and revision=p_revision+1;
   if result_id is not null then return result_id; end if;
   raise exception 'Periode sudah Closed' using errcode='55000';
 end if;
 if p.revision is distinct from p_revision then raise exception 'Versi periode berubah. Muat ulang pratinjau.' using errcode='40001'; end if;
 preview:=public.collection_closing_preview(p_month,p_cutoff);
 if p_token is null or preview->>'token' <> p_token then
   raise exception 'Data berubah sejak pratinjau. Muat ulang pratinjau closing.' using errcode='40001'; end if;
 insert into public.collection_closings(month,revision,cutoff,source,source_hash,closed_by)
 values(p_month,p.revision+1,p_cutoff,preview->'source',p_token,auth.uid()) returning id into result_id;
 update public.collection_periods set status='closed',revision=p.revision+1,aging_data=coalesce(aging_data,private.collection_aging((select id from public.ar_aging_snapshots order by month desc limit 1))),updated_at=now() where month=p_month;
 insert into public.collection_closing_log(month,revision,action,reason,actor)
 values(p_month,p.revision+1,'close','Tanggal laporan Aging dikonfirmasi oleh pelaksana closing',auth.uid());
 return result_id;
end $$;

create function public.collection_reopen(p_month text,p_revision integer,p_reason text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare p public.collection_periods;
begin
 if auth.uid() is null or not private.is_sa() then raise exception 'Hanya Super Admin dapat membuka kembali closing' using errcode='42501'; end if;
 if length(trim(coalesce(p_reason,'')))<10 then raise exception 'Isi alasan pembukaan kembali (minimal 10 karakter)'; end if;
 select * into p from public.collection_periods where month=p_month for update;
 if not found or p.status<>'closed' or p.revision is distinct from p_revision then raise exception 'Status periode berubah. Muat ulang.' using errcode='40001'; end if;
 -- Keep the full compact cut-off projection on reopen, so newly corrected targets can still resolve.
 -- Published closing revisions independently own their target-relevant source rows.
 update public.collection_periods set status='open',updated_at=now() where month=p_month;
 insert into public.collection_closing_log(month,revision,action,reason,actor) values(p_month,p.revision,'reopen',trim(p_reason),auth.uid());
end $$;

-- Add explicit source date and period binding to the existing shared pipeline, preserving all module effects.
-- Old clients can still update operational aging, but cannot overwrite a bound/closed Collection report.
do $$
declare d text;
begin
 select pg_get_functiondef('public.aging_commit(uuid)'::regprocedure) into d;
 if position('v_month := to_char(v_as_of, ''YYYY-MM'');' in d)=0 then raise exception 'aging_commit date hook not found'; end if;
 d:=replace(d,'v_month := to_char(v_as_of, ''YYYY-MM'');', $hook$
  if b.meta ? 'reportDate' then
    v_as_of := (b.meta->>'reportDate')::date;
    if v_as_of is null or v_as_of > (now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal laporan Aging tidak valid'; end if;
    if exists(select 1 from private.upload_rows where batch=p_batch and (data->>'invoice_date')::date > v_as_of) then
      raise exception 'Tanggal laporan mendahului tanggal invoice dalam file'; end if;
  end if;
  if b.meta ? 'collectionMonth' then
    perform private.collection_month(b.meta->>'collectionMonth');
    if to_char(v_as_of,'YYYY-MM') <> b.meta->>'collectionMonth' then raise exception 'Bulan laporan Aging harus sesuai periode Collection tujuan'; end if;
  end if;
  v_month := to_char(v_as_of, 'YYYY-MM');
 $hook$);
 if position('delete from private.upload_batches where id = p_batch;' in d)=0 then raise exception 'aging_commit binding hook not found'; end if;
 d:=replace(d,'delete from private.upload_batches where id = p_batch;', $hook$
  if b.meta ? 'reportDate' then update public.ar_aging_snapshots set report_date=v_as_of where id=v_snap; end if;
  if b.meta ? 'collectionMonth' then
    insert into public.collection_periods(month) values(b.meta->>'collectionMonth') on conflict do nothing;
    perform 1 from public.collection_periods where month=b.meta->>'collectionMonth' for update;
    if exists(select 1 from public.collection_periods where month=b.meta->>'collectionMonth' and status='closed') then
      raise exception 'Periode Collection sudah Closed. Pilih periode Open.' using errcode='55000'; end if;
    update public.collection_periods set aging_data=private.collection_aging(v_snap),updated_at=now()
      where month=b.meta->>'collectionMonth';
  end if;
  delete from private.upload_batches where id = p_batch;
 $hook$);
 execute d;
end $$;

-- Replacing even an empty target set must honor closing (row triggers alone do not cover zero rows).
do $$
declare d text;
begin
 select pg_get_functiondef('public.ar_target_replace(text,jsonb,text)'::regprocedure) into d;
 if position('delete from public.ar_targets where month = p_month;' in d)=0 then raise exception 'target hook not found'; end if;
 d:=replace(d,'delete from public.ar_targets where month = p_month;', $hook$
  perform private.collection_month(p_month);
  -- Lock order matches closing and normal DML before locking the period.
  lock table public.ar_targets in row exclusive mode;
  insert into public.collection_periods(month) values(p_month) on conflict do nothing;
  perform 1 from public.collection_periods where month=p_month for update;
  if exists(select 1 from public.collection_periods where month=p_month and status='closed') then
    raise exception 'Target bulan ini sudah Closed' using errcode='55000'; end if;
  delete from public.ar_targets where month = p_month;
 $hook$);
 execute d;
end $$;

revoke all on function private.collection_month(text), private.collection_read_allowed(), private.collection_manage_allowed(),
 private.collection_target_guard(),private.collection_no_truncate(),private.collection_immutable(),
 private.collection_sj_parts(text),private.collection_aging(bigint),private.collection_source(text,date) from public,anon,authenticated;
revoke all on function public.collection_period_get(text),public.collection_closing_preview(text,date),
 public.collection_close(text,date,text,integer,boolean),public.collection_reopen(text,integer,text) from public,anon;
grant execute on function public.collection_period_get(text),public.collection_closing_preview(text,date),
 public.collection_close(text,date,text,integer,boolean),public.collection_reopen(text,integer,text) to authenticated;

create function public.collection_closing_source(p_month text,p_revision integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare src jsonb;
begin
 if not private.collection_read_allowed() then raise exception 'Akses ditolak' using errcode='42501'; end if;
 select source into src from public.collection_closings where month=p_month and revision=p_revision;
 if src is null then raise exception 'Versi closing tidak ditemukan'; end if;
 return src;
end $$;
revoke all on function public.collection_closing_source(text,integer) from public,anon;
grant execute on function public.collection_closing_source(text,integer) to authenticated;

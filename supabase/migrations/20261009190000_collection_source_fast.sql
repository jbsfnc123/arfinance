-- Fase 59: Dashboard Collection lebih cepat — hasil BYTE-IDENTIK (schemaVersion 1, token md5 preview/close sama).
-- Sebelumnya collection_source membangun JSON seluruh baris Aging snapshot (±22 rb) lalu membongkarnya lagi untuk
-- difilter ke baris target (±7 rb), dan pembayaran memakai OR (scan seluruh erp_payments) → 3–11 dtk, timeout.
-- Kini: baris Aging dibaca relasional (hanya yang terkait target), pembayaran dua kueri ber-indeks yang saling lepas,
-- dan hasil bulan open di-cache per (bulan, cutoff, versi data) sehingga banyak tab/pengguna = satu kali hitung.

-- 1. Versi lama disimpan apa adanya: dipakai untuk bulan yang aging_data-nya sudah berisi lines (pernah closing lalu
--    dibuka ulang) dan sebagai pembanding.
create or replace function private.collection_source_v1(p_month text, p_cutoff date)
returns jsonb
language sql stable security definer set search_path = ''
as $function$
 with targets as materialized (
   select month,invoice_no,target,marketing,collection_name,business_partner,due_date,branch,no_sj
   from public.ar_targets where month=p_month
 ), ag as materialized (
   select coalesce((select case when aging_data ? 'lines' then aging_data
      else private.collection_aging((aging_data->>'snapshotId')::bigint) end
      from public.collection_periods where month=p_month),
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
$function$;
revoke execute on function private.collection_source_v1(text, date) from public, anon, authenticated;

-- 2. Versi cepat dengan hasil identik.
create or replace function private.collection_source(p_month text, p_cutoff date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_pd jsonb;
  v_snap bigint;
  v_meta jsonb;
  v_from date := (p_month || '-01')::date;
  v_to date := (p_month || '-01')::date + interval '1 month';
begin
  select aging_data into v_pd from public.collection_periods where month = p_month;
  if coalesce(v_pd ? 'lines', false) then
    return private.collection_source_v1(p_month, p_cutoff);
  end if;
  -- Snapshot periode (bila masih ada) atau snapshot terbaru — sama dengan coalesce(collection_aging(..), terbaru).
  select s.id into v_snap from public.ar_aging_snapshots s where s.id = (v_pd->>'snapshotId')::bigint;
  if v_snap is null then
    select s.id into v_snap from public.ar_aging_snapshots s order by s.month desc limit 1;
  end if;
  select jsonb_build_object('snapshotId',s.id,'asOf',coalesce(s.report_date,s.as_of),
           'verified',s.report_date is not null,'fileName',s.file_name,'uploadedAt',s.created_at)
    into v_meta from public.ar_aging_snapshots s where s.id = v_snap;

  return (
   with targets as materialized (
     select month,invoice_no,target,marketing,collection_name,business_partner,due_date,branch,no_sj
     from public.ar_targets where month=p_month
   ), sj as materialized (
     select distinct s from targets t cross join lateral private.collection_sj_parts(t.no_sj) s
   ), lines as materialized (
     -- Baris Aging yang invoicenya target ATAU salah satu bagian No SJ-nya (logika collection_sj_parts) ada di SJ target.
     select l.line_no,l.invoice_no,l.payment_group,l.marketing,l.collection_name,l.business_partner,l.bp_key,
            l.invoice_date,l.due_date,l.open_amt,l.no_po,l.no_sj
     from public.ar_aging_lines l
     where l.snapshot_id = v_snap
       and (l.invoice_no in (select invoice_no from targets)
            or exists (select 1 from regexp_split_to_table(upper(trim(coalesce(l.no_sj,''))), '(?=SJ/)') x
                       where btrim(x,'- ,;' || chr(9) || chr(10) || chr(13)) in (select s from sj)))
   ), invoices as materialized (
     select invoice_no from targets union select invoice_no from lines
   ), pay as (
     -- Sama dengan "(tanggal di bulan) OR (invoice target/pengganti)", dipecah jadi dua himpunan yang saling lepas.
     select e.invoice_no,e.payment_date,e.amount from public.erp_payments e
     where e.payment_date >= v_from and e.payment_date < v_to
     union all
     select e.invoice_no,e.payment_date,e.amount from public.erp_payments e
     where e.invoice_no in (select invoice_no from invoices)
       and coalesce(not (e.payment_date >= v_from and e.payment_date < v_to), true)
   )
   select jsonb_build_object('schemaVersion',1,'month',p_month,'cutoff',p_cutoff,
     'aging',case when v_meta is null then null else
       v_meta || jsonb_build_object('lines',coalesce((select jsonb_agg(to_jsonb(l) order by l.line_no) from lines l),'[]'::jsonb)) end,
     'targets',coalesce((select jsonb_agg(to_jsonb(t) order by t.invoice_no) from targets t),'[]'::jsonb),
     'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.invoice_no,p.payment_date) from (
        select invoice_no,payment_date,sum(amount) amount from pay group by invoice_no,payment_date
      ) p),'[]'::jsonb),
     'notes',coalesce((select jsonb_agg(to_jsonb(n) order by n.id) from (
        select id,invoice_no,kategori from public.notes where kategori='Case'
      ) n),'[]'::jsonb),
     'promises',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from (
        select distinct on (invoice_no) id,invoice_no,promise_date from public.payment_promises
        where invoice_no in (select invoice_no from targets) order by invoice_no,id desc
      ) p),'[]'::jsonb),
     'settings',coalesce((select jsonb_object_agg(key,value) from public.app_settings where key='collection_filter'),'{}'::jsonb))
  );
end
$function$;

-- 3. Cache bulan open: berlaku selama cutoff (hari ini) & versi data sumber sama. Semua tabel sumber membump
--    data_versions (aging, targets, activity, erp, settings; collection_closing untuk periode).
create table if not exists private.collection_source_cache (
  month text primary key,
  cutoff date not null,
  versions text not null,
  source jsonb not null,
  built_at timestamptz not null default now()
);
alter table private.collection_source_cache enable row level security;
revoke all on private.collection_source_cache from public, anon, authenticated;

create or replace function private.collection_versions()
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(string_agg(key || '=' || updated_at::text, ';' order by key), '')
  from public.data_versions where key in ('aging', 'targets', 'activity', 'erp', 'settings', 'collection_closing');
$$;
revoke execute on function private.collection_versions() from public, anon, authenticated;

create or replace function private.collection_source_cached(p_month text, p_cutoff date)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_ver text := private.collection_versions(); v_src jsonb;
begin
  select c.source into v_src from private.collection_source_cache c
  where c.month = p_month and c.cutoff = p_cutoff and c.versions = v_ver;
  if found then return v_src; end if;
  v_src := private.collection_source(p_month, p_cutoff);
  insert into private.collection_source_cache (month, cutoff, versions, source, built_at)
  values (p_month, p_cutoff, v_ver, v_src, now())
  on conflict (month) do update set cutoff = excluded.cutoff, versions = excluded.versions,
    source = excluded.source, built_at = excluded.built_at;
  return v_src;
end;
$$;
revoke execute on function private.collection_source_cached(text, date) from public, anon, authenticated;

-- 4. collection_period_get: bulan open lewat cache (fungsi kini VOLATILE karena menulis cache). Selebihnya sama.
create or replace function public.collection_period_get(p_month text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $function$
declare p public.collection_periods; c public.collection_closings; src jsonb;
begin
 if not private.collection_read_allowed() then raise exception 'Akses ditolak' using errcode='42501'; end if;
 perform private.collection_month(p_month);
 select * into p from public.collection_periods where month=p_month;
 if p.status='closed' then
   select * into c from public.collection_closings where month=p_month and revision=p.revision;
   if c.id is null then raise exception 'Snapshot closing tidak ditemukan'; end if;
   src:=c.source;
 else src:=private.collection_source_cached(p_month,(now() at time zone 'Asia/Jakarta')::date); end if;
 return jsonb_build_object('month',p_month,'status',coalesce(p.status,'open'),'revision',coalesce(p.revision,0),
   'canManage',private.collection_manage_allowed(),'canReopen',private.is_sa(),'source',src,
   'closedAt',c.closed_at,'closedBy',c.closed_by,
   'months',(select coalesce(jsonb_agg(month order by month desc),'[]'::jsonb) from (select distinct month::text from public.ar_targets union select month from public.collection_periods) m),
   'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.id desc),'[]'::jsonb) from (
      select id,revision,action,reason,at,actor from public.collection_closing_log where month=p_month order by id desc limit 50) h));
end $function$;

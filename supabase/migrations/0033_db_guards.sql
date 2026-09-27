-- 0033: Fase 29 — audit database (bagian tanpa penghapusan data).
-- 1) aging_commit menolak file yang bukan Aging (pernah terjadi: file Target September masuk sebagai snapshot 2026-08;
--    karena snapshot bulan yang sama dihapus lalu diganti, file Target bisa menimpa aging asli).
-- 2) erp_commit tidak lagi menyimpan pembayaran ber-doc gabungan ("A/…/B/…") bila doc tunggal dengan invoice, tanggal &
--    nominal sama sudah ada (sumber duplikat pembayaran).
-- 3) pack_erp lebih ringkas: payment_term & nama/lokasi BP dikirim sebagai kamus + indeks per invoice.
-- 4) RLS bank_accounts: satu policy SELECT (sebelumnya dua policy permissive dievaluasi bersamaan).
-- Penghapusan data/objek (snapshot palsu, retensi, duplikat lama, Master BP, fungsi mati) menunggu persetujuan user.

-- ── 1) Pengaman aging_commit ──────────────────────────────────────────────────────────────────
do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef('public.aging_commit(uuid)'::regprocedure) into v_def;
  v_new := replace(v_def,
    '  b := private.take_batch(p_batch, ''aging'');
',
    '  b := private.take_batch(p_batch, ''aging'');
  -- File aging (Blank_A4) selalu punya Tax Name dan/atau kolom umur piutang; file Target tidak.
  if not exists (
    select 1 from private.upload_rows u
    where u.batch = p_batch and (
      nullif(trim(u.data->>''tax_name''), '''') is not null
      or coalesce((u.data->>''cur_0_30'')::numeric, 0) <> 0 or coalesce((u.data->>''cur_31_60'')::numeric, 0) <> 0
      or coalesce((u.data->>''due_1_7'')::numeric, 0) <> 0 or coalesce((u.data->>''due_8_30'')::numeric, 0) <> 0
      or coalesce((u.data->>''due_31_60'')::numeric, 0) <> 0 or coalesce((u.data->>''due_61_90'')::numeric, 0) <> 0
      or coalesce((u.data->>''due_90'')::numeric, 0) <> 0)
  ) then
    raise exception ''File ini terlihat seperti file Target, bukan Aging (tidak ada kolom Tax Name / umur piutang). Upload lewat Target Bulanan.''
      using errcode = ''22023'';
  end if;
');
  if v_new = v_def then
    raise exception 'aging_commit: baris take_batch tidak ditemukan';
  end if;
  execute v_new;
end $$;

-- ── 2) Cegah duplikat pembayaran ERP ber-doc gabungan ────────────────────────────────────────
do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef('public.erp_commit(uuid)'::regprocedure) into v_def;
  v_new := replace(v_def,
    '  from _erp where payment_date is not null
  order by invoice_no, payment_doc, seq',
    '  from _erp e where payment_date is not null
    -- doc gabungan ("A/…/B/…") dilewati bila doc tunggal dengan invoice, tanggal & nominal sama ada di file / DB
    and not exists (select 1 from _erp x where x.invoice_no = e.invoice_no and x.payment_date = e.payment_date
                    and coalesce(x.payment_amount, 0) = coalesce(e.payment_amount, 0) and x.payment_doc <> e.payment_doc
                    and e.payment_doc like x.payment_doc || ''/%'')
    and not exists (select 1 from public.erp_payments q where q.invoice_no = e.invoice_no and q.payment_date = e.payment_date
                    and q.amount = coalesce(e.payment_amount, 0) and e.payment_doc like q.payment_doc || ''/%'')
  order by invoice_no, payment_doc, seq');
  if v_new = v_def then
    raise exception 'erp_commit: pernyataan insert pembayaran tidak ditemukan';
  end if;
  execute v_new;
end $$;

-- ── 3) pack_erp ringkas: kamus term & label BP ────────────────────────────────────────────────
-- Kamus terurut (sama dengan urutan dense_rank di pack_erp): pair=false → ["a", …]; pair=true → [["a","b"], …].
create or replace function private.dict(p_sql text, p_pair boolean)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v jsonb;
begin
  execute format('select coalesce(jsonb_agg(%s order by a, b), ''[]''::jsonb) from (%s) z',
    case when p_pair then 'jsonb_build_array(a, b)' else 'a' end, p_sql) into v;
  return v;
end;
$$;
revoke all on function private.dict(text, boolean) from public, anon, authenticated;

create or replace function public.pack_erp()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_where text;
begin
  if private.is_ctrl() or private.has_menu('rek.mutasi') or private.has_menu('lap.presentasi') or private.has_menu('rek.marketplace') then
    v_where := 'true';
  elsif private.my_kind() = 'coll' then
    v_where := 'invoice_no in (select invoice_no from private.my_collection_invoices())';
  elsif private.has_menu('coll.payhist') then
    v_where := 'true';
  else
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  -- t = indeks ke `terms`, l = indeks ke `labels` ([bp_name, bp_location]); urutan kamus = urutan dense_rank.
  return jsonb_build_object(
    'invoices', private.pack(
      'select invoice_no, invoice_date, amount, bp_key, due_date,
              dense_rank() over (order by coalesce(payment_term, '''')) - 1 as t,
              dense_rank() over (order by coalesce(bp_name, ''''), coalesce(bp_location, '''')) - 1 as l
       from public.erp_invoices where ' || v_where || ' order by invoice_date, invoice_no',
      array['invoice_no', 'invoice_date', 'amount', 'bp_key', 'due_date', 't', 'l']),
    'terms', private.dict('select distinct coalesce(payment_term, '''') as a, ''''::text as b from public.erp_invoices where ' || v_where, false),
    'labels', private.dict('select distinct coalesce(bp_name, '''') as a, coalesce(bp_location, '''') as b from public.erp_invoices where ' || v_where, true),
    'payments', private.pack('select invoice_no, payment_date, amount from public.erp_payments where ' || v_where || ' order by payment_date, id',
      array['invoice_no', 'payment_date', 'amount']));
end;
$$;

-- Klien memuat ulang dataset ERP dengan format baru.
update public.data_versions set updated_at = now() where key = 'erp';

-- ── 4) RLS bank_accounts: satu policy SELECT ─────────────────────────────────────────────────
drop policy if exists "baca rekening" on public.bank_accounts;
drop policy if exists "sa kelola rekening" on public.bank_accounts;
create policy "baca rekening" on public.bank_accounts for select to authenticated
  using ((select private.has_menu('rek.mutasi')) or (select private.is_sa()));
create policy "sa tambah rekening" on public.bank_accounts for insert to authenticated with check ((select private.is_sa()));
create policy "sa ubah rekening" on public.bank_accounts for update to authenticated
  using ((select private.is_sa())) with check ((select private.is_sa()));
create policy "sa hapus rekening" on public.bank_accounts for delete to authenticated using ((select private.is_sa()));

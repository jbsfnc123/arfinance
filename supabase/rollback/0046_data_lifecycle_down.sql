-- Rollback 0046_data_lifecycle (Fase 47). Data yang sudah dihapus pembersihan TIDAK kembali (lihat cleanup_log untuk jejak).
-- Kontak: kembali ke 1 baris per BP — baris ganda per BP dibuang (yang id-nya terkecil dipertahankan).
drop trigger if exists ephemeral_after_aging on public.ar_aging_lines;
drop function if exists private.ephemeral_after_aging();
drop function if exists public.cleanup_run_pending();
drop function if exists public.cleanup_delete(text, text[], date);
drop function if exists public.cleanup_preview(text, date);
drop function if exists public.cleanup_overview(date);
drop function if exists private.cleanup_candidates(text, date);
drop function if exists private.prune_ephemeral(boolean, text);
drop table if exists private.cleanup_hold;
drop table if exists public.cleanup_log;
drop function if exists private.aging_remark_refs();
drop function if exists private.aging_invoice_keys();
drop function if exists private.aging_latest_id();
drop function if exists public.contacts_save(jsonb);

delete from public.invoice_remarks where source = 'import';
alter table public.invoice_remarks drop constraint invoice_remarks_source_check;
alter table public.invoice_remarks add constraint invoice_remarks_source_check
  check (source = any (array['collection', 'mitra10', 'rkm', 'hold', 'pengajuan', 'catatan']));

delete from public.contacts c using public.contacts d
  where lower(trim(c.business_partner)) = lower(trim(d.business_partner)) and c.id > d.id;
drop index if exists public.contacts_bp_wa_uniq;
drop index if exists public.contacts_bp_idx;
alter table public.contacts drop constraint contacts_pkey;
alter table public.contacts drop column id;
alter table public.contacts drop column kode_bp;
alter table public.contacts add primary key (business_partner);

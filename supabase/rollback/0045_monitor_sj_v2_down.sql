-- Rollback 0045_monitor_sj_v2 (Fase 46): hapus objek model baru. Data penerimaan (sj_receipts) ikut terhapus.
-- Data model lama (sj_events/sj_batches) TIDAK bisa dikembalikan (sudah dihapus atas permintaan user). Untuk kembali ke
-- model lama: revert kode Fase 46, jalankan ulang bagian tabel batch/staging/kejadian & RPC dari 0042 + 0044
-- (sj_receivers tetap ada), lalu upload ulang file CSV.
drop trigger if exists sj_after_aging on public.ar_aging_lines;
drop function if exists private.sj_after_aging();
drop function if exists private.sj_prune();
drop function if exists public.sj_receipts_apply(text, jsonb);
drop function if exists public.pack_sj();
drop table if exists public.sj_receipts;
drop function if exists private.sj_aging_keys();
delete from public.import_log where module = 'sj';

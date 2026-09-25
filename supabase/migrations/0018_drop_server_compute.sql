-- 0018: perhitungan dashboard & daftar kini di browser (lib/modules/*/compute, rows.ts).
-- View/RPC server yang menghitung hal yang sama dihapus supaya tidak ada dua sumber angka.
drop function if exists public.get_spv_summary(text);
drop function if exists public.mutasi_dashboard(text);
drop function if exists public.tukar_dashboard(text, text);
drop view if exists public.v_collection_rows;
drop view if exists public.v_note_latest;
drop view if exists public.v_collection_summary;

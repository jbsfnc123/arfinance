-- "Gagal memuat: canceling statement due to statement timeout": pemuat data besar (pack_aging/erp/m10 4–10 MB) yang berjalan
-- bersamaan saling berebut CPU sehingga sebagian melewati batas 8 detik role authenticated (log 2026-10-26: 3–5 timeout per
-- detik yang sama). Diukur sendiri-sendiri hanya 0,1–3,4 detik. Batas dinaikkan ke 20 detik (cara yang dianjurkan Supabase);
-- klien juga membatasi pemuatan bersamaan & mencoba ulang (lib/local/store.ts).
-- Rollback: alter role authenticated set statement_timeout = '8s'; notify pgrst, 'reload config';
alter role authenticated set statement_timeout = '20s';
notify pgrst, 'reload config';

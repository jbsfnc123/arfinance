-- 0041: Fase 44 — perketat hak tabel row_marks. Default privilege Supabase memberi role authenticated hak
-- insert/update/delete/truncate/references/trigger pada tabel baru. Insert/update/delete sudah ditolak RLS (tanpa
-- policy tulis), tetapi TRUNCATE tidak dicakup RLS → cabut semua kecuali SELECT. Mutasi tetap hanya lewat RPC
-- row_marks_set (security definer). Hanya menyangkut tabel baru row_marks.
revoke insert, update, delete, truncate, references, trigger on public.row_marks from authenticated;

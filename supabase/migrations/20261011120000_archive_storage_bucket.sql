-- Fase 66c: salinan baca cepat file arsip (.json.gz). Arsip utama tetap Google Drive. Bucket privat tanpa policy:
-- hanya server (service role, route /api/archive/*) yang membaca/menulis; hak baca pengguna dicek oleh RPC archive_file.
insert into storage.buckets (id, name, public, file_size_limit)
values ('archive', 'archive', false, 52428800)
on conflict (id) do nothing;

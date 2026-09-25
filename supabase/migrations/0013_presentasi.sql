-- 0013: Fase 6 — AR Management Deck. State deck (dulu IndexedDB per browser) disimpan
-- utuh sebagai satu dokumen JSON bersama, supaya semua pengguna melihat presentasi yang sama.
create table public.deck_state (
  id        smallint primary key default 1 check (id = 1),
  state     jsonb not null,
  saved_at  timestamptz not null default now(),
  saved_by  uuid references public.profiles(id) on delete set null default auth.uid()
);
alter table public.deck_state enable row level security;
create policy "baca deck" on public.deck_state
  for select to authenticated using (private.has_menu('lap.presentasi'));
create policy "simpan deck" on public.deck_state
  for insert to authenticated with check (private.has_menu('lap.presentasi'));
create policy "ubah deck" on public.deck_state
  for update to authenticated using (private.has_menu('lap.presentasi')) with check (private.has_menu('lap.presentasi'));
create policy "hapus deck" on public.deck_state
  for delete to authenticated using (private.has_menu('lap.presentasi'));
create index deck_state_saved_by_idx on public.deck_state (saved_by);

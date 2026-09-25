-- 0023: Fase 15 — Beranda = papan sticky notes bersama (maks. 10), akses lewat menu 'home'.

create table public.sticky_notes (
  id              bigint generated always as identity primary key,
  body            text not null default '' check (char_length(body) <= 1000),
  color           text not null default 'yellow' check (color in ('yellow', 'green', 'blue', 'pink', 'purple')),
  created_by      uuid default auth.uid() references public.profiles(id) on delete set null,
  created_by_name text,
  updated_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index sticky_notes_created_by_idx on public.sticky_notes (created_by);

alter table public.sticky_notes enable row level security;
create policy sticky_notes_select on public.sticky_notes for select to authenticated using (private.has_menu('home'));
create policy sticky_notes_insert on public.sticky_notes for insert to authenticated with check (private.has_menu('home'));
create policy sticky_notes_update on public.sticky_notes for update to authenticated using (private.has_menu('home')) with check (private.has_menu('home'));
create policy sticky_notes_delete on public.sticky_notes for delete to authenticated using (private.has_menu('home'));

-- Nama pembuat/pengubah dari profil; batas 10 note dijaga di server (kunci agar insert bersamaan aman).
create or replace function private.sticky_notes_stamp()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_name text := (select display_name from public.profiles where id = (select auth.uid()));
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('sticky_notes'));
    if (select count(*) from public.sticky_notes) >= 10 then
      raise exception 'Maksimal 10 sticky notes' using errcode = 'P0001';
    end if;
    new.created_by := (select auth.uid());
    new.created_by_name := v_name;
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
  end if;
  new.updated_by_name := v_name;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function private.sticky_notes_stamp() from public, anon, authenticated;

create trigger sticky_notes_stamp before insert or update on public.sticky_notes
  for each row execute function private.sticky_notes_stamp();

grant select, insert, update, delete on public.sticky_notes to authenticated;

alter publication supabase_realtime add table public.sticky_notes;

-- Role yang sudah ada tetap bisa membuka Beranda (Super Admin dapat mencabutnya di Role & Akses Menu).
insert into public.role_menus (role_id, submenu_id)
select id, 'home' from public.roles where kind <> 'sa'
on conflict do nothing;

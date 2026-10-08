-- Permission only: no changes to financial datasets, history or existing RLS.
alter table public.profiles
  add column if not exists chatbot_enabled boolean not null default false;

comment on column public.profiles.chatbot_enabled is
  'Chatbot Bang Mando access granted per account by Super Admin. Super Admin has automatic access.';

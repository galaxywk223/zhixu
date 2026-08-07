alter table public.tasks
  add column if not exists external_source text,
  add column if not exists external_key text,
  add column if not exists created_by_import_batch_id text;

create unique index if not exists tasks_user_external_key_idx
  on public.tasks(user_id, external_source, external_key)
  where external_source is not null and external_key is not null and deleted_at is null;

create table if not exists public.life_events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null,
  source text not null default 'tomatodo',
  kind text not null default 'other',
  title text not null,
  occurred_at timestamptz not null,
  note text,
  import_batch_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  device_id text not null,
  server_revision bigint not null default 0,
  unique(user_id, source_key)
);

create index if not exists life_events_user_updated_idx
  on public.life_events(user_id, updated_at);

alter table public.life_events enable row level security;

create policy life_events_owner_policy on public.life_events
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table public.life_events;

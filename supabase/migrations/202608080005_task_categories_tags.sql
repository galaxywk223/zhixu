alter table public.tasks add column if not exists category_id text;

create table if not exists public.task_categories (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  color_hex text not null default '#175CD3',
  source text not null default 'tomatodo',
  last_seen_at timestamptz,
  is_archived boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  device_id text not null,
  server_revision bigint not null default 0
);

create table if not exists public.tags (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  color_hex text not null default '#38BDF8',
  is_archived boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  device_id text not null,
  server_revision bigint not null default 0
);

create table if not exists public.tag_links (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  tag_id text not null,
  entity_type text not null,
  entity_id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  device_id text not null,
  server_revision bigint not null default 0
);

create unique index if not exists task_categories_user_name_idx
  on public.task_categories(user_id, source, normalized_name)
  where deleted_at is null;
create unique index if not exists tags_user_name_idx
  on public.tags(user_id, normalized_name) where deleted_at is null;
create unique index if not exists tag_links_user_entity_idx
  on public.tag_links(user_id, tag_id, entity_type, entity_id)
  where deleted_at is null;
create index if not exists task_categories_user_updated_idx
  on public.task_categories(user_id, updated_at);
create index if not exists tags_user_updated_idx on public.tags(user_id, updated_at);
create index if not exists tag_links_user_updated_idx
  on public.tag_links(user_id, updated_at);

alter table public.task_categories enable row level security;
alter table public.tags enable row level security;
alter table public.tag_links enable row level security;

create policy task_categories_owner_policy on public.task_categories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tags_owner_policy on public.tags
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tag_links_owner_policy on public.tag_links
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table public.task_categories;
alter publication supabase_realtime add table public.tags;
alter publication supabase_realtime add table public.tag_links;

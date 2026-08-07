create extension if not exists pgcrypto;

create table public.tasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description_md text,
  status text not null default 'todo',
  priority integer not null default 1,
  due_at timestamptz,
  estimated_minutes integer not null default 0,
  repeat_rule text,
  project_id text,
  parent_task_id text,
  completed_at timestamptz,
  is_archived boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  device_id text not null,
  server_revision bigint not null default 0
);

create table public.projects (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'project',
  description_md text,
  start_date timestamptz,
  target_date timestamptz,
  color_hex text not null default '#3B82F6',
  is_archived boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  device_id text not null,
  server_revision bigint not null default 0
);

create table public.schedule_blocks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  task_id text,
  project_id text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  is_all_day boolean not null default false,
  repeat_rule text,
  color_hex text not null default '#2563EB',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  device_id text not null,
  server_revision bigint not null default 0
);

create table public.notes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content_md text not null default '',
  notebook_id text,
  project_id text,
  is_pinned boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  device_id text not null,
  server_revision bigint not null default 0
);

create table public.focus_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null,
  source text not null default 'tomatodo',
  start_at timestamptz not null,
  end_at timestamptz not null,
  task_name text not null,
  duration_minutes integer not null,
  reflection text,
  status text not null,
  completion_percent integer not null default 0,
  linked_task_id text,
  linked_project_id text,
  import_batch_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  device_id text not null,
  server_revision bigint not null default 0,
  unique(user_id, source_key)
);

create index tasks_user_updated_idx on public.tasks(user_id, updated_at);
create index projects_user_updated_idx on public.projects(user_id, updated_at);
create index schedule_blocks_user_updated_idx on public.schedule_blocks(user_id, updated_at);
create index notes_user_updated_idx on public.notes(user_id, updated_at);
create index focus_sessions_user_updated_idx on public.focus_sessions(user_id, updated_at);

do $$ declare t text; begin
  foreach t in array array['tasks','projects','schedule_blocks','notes','focus_sessions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I_owner on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_owner_policy', t);
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;

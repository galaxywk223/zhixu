create sequence if not exists public.server_revision_seq as bigint;

create table if not exists public.sync_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id text not null,
  entity_type text not null,
  entity_id text not null,
  base_revision bigint not null default 0,
  applied_revision bigint,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

create table if not exists public.sync_changes (
  revision bigint primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  operation text not null check (operation in ('upsert', 'delete')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.note_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id text not null,
  operation_id text not null,
  base_revision bigint not null,
  remote_revision bigint not null,
  local_payload jsonb not null,
  remote_payload jsonb not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, operation_id)
);

create index if not exists sync_changes_user_revision_idx
  on public.sync_changes(user_id, revision);
create index if not exists note_conflicts_user_open_idx
  on public.note_conflicts(user_id, created_at desc) where resolved_at is null;

alter table public.sync_operations enable row level security;
alter table public.sync_changes enable row level security;
alter table public.note_conflicts enable row level security;

create policy sync_operations_owner on public.sync_operations
  for select using (user_id = auth.uid());
create policy sync_changes_owner on public.sync_changes
  for select using (user_id = auth.uid());
create policy note_conflicts_owner on public.note_conflicts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.zhixu_record_revision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_revision bigint;
  entity_kind text;
begin
  next_revision := nextval('public.server_revision_seq');
  new.server_revision := next_revision;
  entity_kind := case tg_table_name
    when 'task_categories' then 'task_category'
    when 'tag_links' then 'tag_link'
    when 'schedule_blocks' then 'schedule_block'
    when 'focus_sessions' then 'focus_session'
    when 'life_events' then 'life_event'
    else rtrim(tg_table_name, 's')
  end;
  insert into public.sync_changes(revision, user_id, entity_type, entity_id, operation, payload)
  values (
    next_revision,
    new.user_id,
    entity_kind,
    new.id,
    case when new.deleted_at is null then 'upsert' else 'delete' end,
    to_jsonb(new) - 'user_id'
  );
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'task_categories', 'tags', 'tasks', 'tag_links', 'notes',
    'schedule_blocks', 'focus_sessions', 'life_events'
  ] loop
    execute format('drop trigger if exists zhixu_revision_trigger on public.%I', table_name);
    execute format(
      'create trigger zhixu_revision_trigger before insert or update on public.%I '
      'for each row execute function public.zhixu_record_revision()',
      table_name
    );
  end loop;
end $$;

create or replace function public.zhixu_apply_operation(operation jsonb)
returns table(operation_id text, applied_revision bigint, applied boolean, conflict boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  operation_key text := operation->>'operation_id';
  entity_kind text := operation->>'entity_type';
  entity_key text := operation->>'entity_id';
  action text := operation->>'operation';
  base_rev bigint := coalesce((operation->>'base_revision')::bigint, 0);
  table_name text;
  current_rev bigint := 0;
  result_rev bigint;
  column_list text;
  update_list text;
  existing_result public.sync_operations%rowtype;
  remote_payload jsonb;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if operation_key is null or entity_key is null then raise exception 'operation_id and entity_id are required'; end if;
  select * into existing_result from public.sync_operations
    where user_id = current_user_id and sync_operations.operation_id = operation_key;
  if found then
    return query select operation_key, existing_result.applied_revision, true,
      coalesce((existing_result.result->>'conflict')::boolean, false);
    return;
  end if;

  table_name := case entity_kind
    when 'task_category' then 'task_categories'
    when 'tag' then 'tags'
    when 'task' then 'tasks'
    when 'tag_link' then 'tag_links'
    when 'note' then 'notes'
    when 'schedule_block' then 'schedule_blocks'
    when 'focus_session' then 'focus_sessions'
    when 'life_event' then 'life_events'
    else null
  end;
  if table_name is null then raise exception 'unsupported entity type: %', entity_kind; end if;
  execute format('select server_revision, to_jsonb(t) - ''user_id'' from public.%I t where id = $1 and user_id = $2', table_name)
    into current_rev, remote_payload using entity_key, current_user_id;
  current_rev := coalesce(current_rev, 0);

  if entity_kind = 'note' and current_rev > base_rev and action = 'upsert' then
    insert into public.note_conflicts(
      user_id, note_id, operation_id, base_revision, remote_revision, local_payload, remote_payload
    ) values (
      current_user_id, entity_key, operation_key, base_rev, current_rev,
      coalesce(operation->'payload', '{}'::jsonb), coalesce(remote_payload, '{}'::jsonb)
    ) on conflict (user_id, operation_id) do nothing;
  end if;

  if action = 'delete' then
    execute format('update public.%I set deleted_at = now(), updated_at = now() where id = $1 and user_id = $2 returning server_revision', table_name)
      into result_rev using entity_key, current_user_id;
  elsif action = 'upsert' then
    select string_agg(format('%I', column_name), ', ' order by ordinal_position),
           string_agg(format('%1$I = excluded.%1$I', column_name), ', ' order by ordinal_position)
      into column_list, update_list
      from information_schema.columns
      where table_schema = 'public' and information_schema.columns.table_name = zhixu_apply_operation.table_name
        and column_name <> 'server_revision';
    execute format(
      'insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1) '
      'on conflict (id) do update set %3$s returning server_revision',
      table_name,
      column_list,
      update_list
    ) into result_rev using (operation->'payload') || jsonb_build_object('id', entity_key, 'user_id', current_user_id);
  else
    raise exception 'unsupported operation: %', action;
  end if;

  insert into public.sync_operations(
    user_id, operation_id, entity_type, entity_id, base_revision, applied_revision, result
  ) values (
    current_user_id, operation_key, entity_kind, entity_key, base_rev, result_rev,
    jsonb_build_object('conflict', entity_kind = 'note' and current_rev > base_rev)
  );
  return query select operation_key, result_rev, true, entity_kind = 'note' and current_rev > base_rev;
end;
$$;

create or replace function public.push_operations(operations jsonb)
returns table(operation_id text, applied_revision bigint, applied boolean, conflict boolean)
language sql
security definer
set search_path = public, pg_temp
as $$
  select result.*
  from jsonb_array_elements(operations) item
  cross join lateral public.zhixu_apply_operation(item) result;
$$;

create or replace function public.pull_changes(after_revision bigint default 0, page_size integer default 500)
returns table(revision bigint, entity_type text, entity_id text, operation text, payload jsonb)
language sql
security invoker
set search_path = public, pg_temp
as $$
  select c.revision, c.entity_type, c.entity_id, c.operation, c.payload
  from public.sync_changes c
  where c.user_id = auth.uid() and c.revision > greatest(after_revision, 0)
  order by c.revision
  limit least(greatest(page_size, 1), 1000);
$$;

revoke all on function public.zhixu_apply_operation(jsonb) from public;
grant execute on function public.push_operations(jsonb) to authenticated;
grant execute on function public.pull_changes(bigint, integer) to authenticated;

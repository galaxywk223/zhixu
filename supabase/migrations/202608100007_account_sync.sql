create table if not exists public.countdowns (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  target_date date not null,
  note text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  device_id text not null,
  server_revision bigint not null default 0
);

create index if not exists countdowns_user_updated_idx
  on public.countdowns(user_id, updated_at);

alter table public.countdowns enable row level security;

drop policy if exists countdowns_owner_policy on public.countdowns;
create policy countdowns_owner_policy on public.countdowns
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'countdowns'
  ) then
    alter publication supabase_realtime add table public.countdowns;
  end if;
end $$;

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
    when 'countdowns' then 'countdown'
    else rtrim(tg_table_name, 's')
  end;
  insert into public.sync_changes(
    revision, user_id, entity_type, entity_id, operation, payload
  ) values (
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
    'schedule_blocks', 'focus_sessions', 'life_events', 'countdowns'
  ] loop
    execute format('drop trigger if exists zhixu_revision_trigger on public.%I', table_name);
    execute format(
      'create trigger zhixu_revision_trigger before insert or update on public.%I '
      'for each row execute function public.zhixu_record_revision()',
      table_name
    );
  end loop;
end $$;

drop function if exists public.push_operations(jsonb);
drop function if exists public.zhixu_apply_operation(jsonb);

create function public.zhixu_apply_operation(operation jsonb)
returns table(
  operation_id text,
  applied_revision bigint,
  applied boolean,
  conflict boolean,
  conflict_id uuid,
  remote_revision bigint,
  remote_payload jsonb
)
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
  result_rev bigint := 0;
  column_list text;
  update_list text;
  existing_result public.sync_operations%rowtype;
  current_payload jsonb;
  incoming_payload jsonb := coalesce(operation->'payload', '{}'::jsonb);
  current_updated timestamptz;
  incoming_updated timestamptz;
  new_conflict_id uuid;
  did_apply boolean := false;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if operation_key is null or entity_key is null then
    raise exception 'operation_id and entity_id are required';
  end if;

  select * into existing_result from public.sync_operations
  where user_id = current_user_id
    and sync_operations.operation_id = operation_key;
  if found then
    return query select
      operation_key,
      existing_result.applied_revision,
      coalesce((existing_result.result->>'applied')::boolean, true),
      coalesce((existing_result.result->>'conflict')::boolean, false),
      nullif(existing_result.result->>'conflict_id', '')::uuid,
      nullif(existing_result.result->>'remote_revision', '')::bigint,
      existing_result.result->'remote_payload';
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
    when 'countdown' then 'countdowns'
    else null
  end;
  if table_name is null then
    raise exception 'unsupported entity type: %', entity_kind;
  end if;

  execute format(
    'select server_revision, to_jsonb(t) - ''user_id'' from public.%I t '
    'where id = $1 and user_id = $2',
    table_name
  ) into current_rev, current_payload using entity_key, current_user_id;
  current_rev := coalesce(current_rev, 0);
  current_updated := nullif(current_payload->>'updated_at', '')::timestamptz;
  incoming_updated := nullif(incoming_payload->>'updated_at', '')::timestamptz;

  if entity_kind = 'note' and current_rev > base_rev and action = 'upsert' then
    insert into public.note_conflicts(
      user_id, note_id, operation_id, base_revision, remote_revision,
      local_payload, remote_payload
    ) values (
      current_user_id, entity_key, operation_key, base_rev, current_rev,
      incoming_payload, coalesce(current_payload, '{}'::jsonb)
    ) on conflict (user_id, operation_id) do update
      set remote_revision = excluded.remote_revision,
          remote_payload = excluded.remote_payload
    returning id into new_conflict_id;

    insert into public.sync_operations(
      user_id, operation_id, entity_type, entity_id, base_revision,
      applied_revision, result
    ) values (
      current_user_id, operation_key, entity_kind, entity_key, base_rev,
      current_rev,
      jsonb_build_object(
        'applied', false,
        'conflict', true,
        'conflict_id', new_conflict_id,
        'remote_revision', current_rev,
        'remote_payload', current_payload
      )
    );
    return query select operation_key, current_rev, false, true,
      new_conflict_id, current_rev, current_payload;
    return;
  end if;

  if current_payload is not null and current_updated is not null
     and incoming_updated is not null and current_updated > incoming_updated then
    result_rev := current_rev;
  elsif action = 'delete' then
    if current_payload is not null then
      execute format(
        'update public.%I set deleted_at = coalesce($3, now()), '
        'updated_at = coalesce($4, now()), device_id = coalesce($5, device_id) '
        'where id = $1 and user_id = $2 returning server_revision',
        table_name
      ) into result_rev using
        entity_key,
        current_user_id,
        nullif(incoming_payload->>'deleted_at', '')::timestamptz,
        incoming_updated,
        incoming_payload->>'device_id';
      did_apply := true;
    end if;
  elsif action = 'upsert' then
    select string_agg(format('%I', column_name), ', ' order by ordinal_position)
      into column_list
    from information_schema.columns
    where table_schema = 'public'
      and information_schema.columns.table_name = zhixu_apply_operation.table_name
      and column_name <> 'server_revision';
    select string_agg(
             format('%1$I = excluded.%1$I', column_name),
             ', ' order by ordinal_position
           )
      into update_list
    from information_schema.columns
    where table_schema = 'public'
      and information_schema.columns.table_name = zhixu_apply_operation.table_name
      and column_name not in ('id', 'user_id', 'server_revision');
    execute format(
      'insert into public.%1$I (%2$s) '
      'select %2$s from jsonb_populate_record(null::public.%1$I, $1) '
      'on conflict (id) do update set %3$s '
      'where %1$I.user_id = excluded.user_id returning server_revision',
      table_name,
      column_list,
      update_list
    ) into result_rev using incoming_payload || jsonb_build_object(
      'id', entity_key,
      'user_id', current_user_id
    );
    if result_rev is null then
      raise exception 'entity id is owned by another account';
    end if;
    did_apply := true;
  else
    raise exception 'unsupported operation: %', action;
  end if;

  insert into public.sync_operations(
    user_id, operation_id, entity_type, entity_id, base_revision,
    applied_revision, result
  ) values (
    current_user_id, operation_key, entity_kind, entity_key, base_rev,
    result_rev,
    jsonb_build_object(
      'applied', did_apply,
      'conflict', false,
      'remote_revision', case when did_apply then result_rev else current_rev end,
      'remote_payload', case when did_apply then null else current_payload end
    )
  );
  return query select operation_key, result_rev, did_apply, false, null::uuid,
    case when did_apply then result_rev else current_rev end,
    case when did_apply then null::jsonb else current_payload end;
end;
$$;

create function public.push_operations(operations jsonb)
returns table(
  operation_id text,
  applied_revision bigint,
  applied boolean,
  conflict boolean,
  conflict_id uuid,
  remote_revision bigint,
  remote_payload jsonb
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select result.*
  from jsonb_array_elements(operations) item
  cross join lateral public.zhixu_apply_operation(item) result;
$$;

create or replace function public.sync_snapshot()
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'revision', coalesce((
      select max(revision) from public.sync_changes where user_id = auth.uid()
    ), 0),
    'entities', jsonb_build_object(
      'task_category', coalesce((select jsonb_agg(to_jsonb(t) - 'user_id') from public.task_categories t where t.user_id = auth.uid()), '[]'::jsonb),
      'tag', coalesce((select jsonb_agg(to_jsonb(t) - 'user_id') from public.tags t where t.user_id = auth.uid()), '[]'::jsonb),
      'task', coalesce((select jsonb_agg(to_jsonb(t) - 'user_id') from public.tasks t where t.user_id = auth.uid()), '[]'::jsonb),
      'tag_link', coalesce((select jsonb_agg(to_jsonb(t) - 'user_id') from public.tag_links t where t.user_id = auth.uid()), '[]'::jsonb),
      'note', coalesce((select jsonb_agg(to_jsonb(t) - 'user_id') from public.notes t where t.user_id = auth.uid()), '[]'::jsonb),
      'schedule_block', coalesce((select jsonb_agg(to_jsonb(t) - 'user_id') from public.schedule_blocks t where t.user_id = auth.uid()), '[]'::jsonb),
      'focus_session', coalesce((select jsonb_agg(to_jsonb(t) - 'user_id') from public.focus_sessions t where t.user_id = auth.uid()), '[]'::jsonb),
      'life_event', coalesce((select jsonb_agg(to_jsonb(t) - 'user_id') from public.life_events t where t.user_id = auth.uid()), '[]'::jsonb),
      'countdown', coalesce((select jsonb_agg(to_jsonb(t) - 'user_id') from public.countdowns t where t.user_id = auth.uid()), '[]'::jsonb)
    )
  );
$$;

create or replace function public.resolve_note_conflict(
  conflict_id uuid,
  resolution text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if resolution not in ('local', 'remote', 'both') then
    raise exception 'unsupported conflict resolution';
  end if;
  update public.note_conflicts
  set resolved_at = now()
  where id = conflict_id and user_id = auth.uid();
  if not found then raise exception 'note conflict not found'; end if;
end;
$$;

revoke all on function public.zhixu_apply_operation(jsonb) from public;
revoke all on function public.push_operations(jsonb) from public;
revoke all on function public.sync_snapshot() from public;
revoke all on function public.resolve_note_conflict(uuid, text) from public;
grant execute on function public.push_operations(jsonb) to authenticated;
grant execute on function public.pull_changes(bigint, integer) to authenticated;
grant execute on function public.sync_snapshot() to authenticated;
grant execute on function public.resolve_note_conflict(uuid, text) to authenticated;

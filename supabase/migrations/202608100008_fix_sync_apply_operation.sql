-- Avoid ambiguity between the target table variable and information_schema columns.
create or replace function public.zhixu_apply_operation(operation jsonb)
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
  target_table_name text;
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

  target_table_name := case entity_kind
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
  if target_table_name is null then
    raise exception 'unsupported entity type: %', entity_kind;
  end if;

  execute format(
    'select server_revision, to_jsonb(t) - ''user_id'' from public.%I t '
    'where id = $1 and user_id = $2',
    target_table_name
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
        target_table_name
      ) into result_rev using
        entity_key,
        current_user_id,
        nullif(incoming_payload->>'deleted_at', '')::timestamptz,
        incoming_updated,
        incoming_payload->>'device_id';
      did_apply := true;
    end if;
  elsif action = 'upsert' then
    select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
      into column_list
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = target_table_name
      and c.column_name <> 'server_revision';
    select string_agg(
             format('%1$I = excluded.%1$I', c.column_name),
             ', ' order by c.ordinal_position
           )
      into update_list
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = target_table_name
      and c.column_name not in ('id', 'user_id', 'server_revision');
    execute format(
      'insert into public.%1$I (%2$s) '
      'select %2$s from jsonb_populate_record(null::public.%1$I, $1) '
      'on conflict (id) do update set %3$s '
      'where %1$I.user_id = excluded.user_id returning server_revision',
      target_table_name,
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

revoke all on function public.zhixu_apply_operation(jsonb) from public;

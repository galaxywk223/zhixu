alter table public.daily_quotes
  add column if not exists source_kind text not null default 'ai'
    check (source_kind in ('ai', 'corpus'));
alter table public.daily_quotes
  add column if not exists source_id text;
alter table public.daily_quotes
  add column if not exists generation_version integer not null default 1
    check (generation_version >= 1);

create index if not exists daily_quotes_user_source_idx
  on public.daily_quotes(user_id, source_kind, source_id);

alter function public.zhixu_apply_operation(jsonb)
  rename to zhixu_apply_operation_v10;

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
  incoming_payload jsonb := coalesce(operation->'payload', '{}'::jsonb);
  existing_result public.sync_operations%rowtype;
  current_payload jsonb;
  current_rev bigint := 0;
  result_rev bigint := 0;
  current_updated timestamptz;
  incoming_updated timestamptz;
  did_apply boolean := false;
begin
  if entity_kind <> 'daily_quote' then
    return query select * from public.zhixu_apply_operation_v10(operation);
    return;
  end if;
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
      false,
      null::uuid,
      nullif(existing_result.result->>'remote_revision', '')::bigint,
      existing_result.result->'remote_payload';
    return;
  end if;

  select q.server_revision, to_jsonb(q) - 'user_id'
    into current_rev, current_payload
  from public.daily_quotes q
  where q.id = entity_key and q.user_id = current_user_id;
  current_rev := coalesce(current_rev, 0);
  current_updated := nullif(current_payload->>'updated_at', '')::timestamptz;
  incoming_updated := nullif(incoming_payload->>'updated_at', '')::timestamptz;

  if current_payload is not null and current_updated is not null
     and incoming_updated is not null and current_updated > incoming_updated then
    result_rev := current_rev;
  elsif action = 'delete' then
    if current_payload is not null then
      update public.daily_quotes
      set deleted_at = coalesce(
            nullif(incoming_payload->>'deleted_at', '')::timestamptz,
            now()
          ),
          updated_at = coalesce(incoming_updated, now()),
          device_id = coalesce(incoming_payload->>'device_id', device_id)
      where id = entity_key and user_id = current_user_id
      returning server_revision into result_rev;
      did_apply := true;
    end if;
  elsif action = 'upsert' then
    insert into public.daily_quotes(
      id, user_id, text, local_date, reaction, source_kind, source_id,
      generation_version, generated_at, created_at, updated_at, deleted_at,
      device_id
    ) values (
      entity_key,
      current_user_id,
      incoming_payload->>'text',
      (incoming_payload->>'local_date')::date,
      coalesce(incoming_payload->>'reaction', 'none'),
      coalesce(incoming_payload->>'source_kind', 'ai'),
      nullif(incoming_payload->>'source_id', ''),
      coalesce((incoming_payload->>'generation_version')::integer, 1),
      (incoming_payload->>'generated_at')::timestamptz,
      (incoming_payload->>'created_at')::timestamptz,
      (incoming_payload->>'updated_at')::timestamptz,
      nullif(incoming_payload->>'deleted_at', '')::timestamptz,
      incoming_payload->>'device_id'
    )
    on conflict (id) do update set
      text = excluded.text,
      local_date = excluded.local_date,
      reaction = excluded.reaction,
      source_kind = case
        when incoming_payload ? 'source_kind' then excluded.source_kind
        else daily_quotes.source_kind
      end,
      source_id = case
        when incoming_payload ? 'source_id' then excluded.source_id
        else daily_quotes.source_id
      end,
      generation_version = case
        when incoming_payload ? 'generation_version' then excluded.generation_version
        else daily_quotes.generation_version
      end,
      generated_at = excluded.generated_at,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at,
      device_id = excluded.device_id
    where daily_quotes.user_id = excluded.user_id
    returning server_revision into result_rev;
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
    current_user_id,
    operation_key,
    entity_kind,
    entity_key,
    base_rev,
    result_rev,
    jsonb_build_object(
      'applied', did_apply,
      'conflict', false,
      'remote_revision', case when did_apply then result_rev else current_rev end,
      'remote_payload', case when did_apply then null else current_payload end
    )
  );

  return query select
    operation_key,
    result_rev,
    did_apply,
    false,
    null::uuid,
    case when did_apply then result_rev else current_rev end,
    case when did_apply then null::jsonb else current_payload end;
end;
$$;

revoke all on function public.zhixu_apply_operation_v10(jsonb) from public;
revoke all on function public.zhixu_apply_operation(jsonb) from public;
grant execute on function public.zhixu_apply_operation_v10(jsonb) to authenticated;
grant execute on function public.zhixu_apply_operation(jsonb) to authenticated;

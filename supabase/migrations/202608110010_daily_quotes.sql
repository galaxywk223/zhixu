create table if not exists public.daily_quotes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(text) between 6 and 48),
  local_date date not null,
  reaction text not null default 'none'
    check (reaction in ('none', 'favorite', 'disliked')),
  generated_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  device_id text not null,
  server_revision bigint not null default 0
);

create index if not exists daily_quotes_user_date_idx
  on public.daily_quotes(user_id, local_date, generated_at desc);
create index if not exists daily_quotes_user_reaction_idx
  on public.daily_quotes(user_id, reaction, updated_at desc);

alter table public.daily_quotes enable row level security;

drop policy if exists daily_quotes_owner_policy on public.daily_quotes;
create policy daily_quotes_owner_policy
  on public.daily_quotes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'daily_quotes'
  ) then
    alter publication supabase_realtime add table public.daily_quotes;
  end if;
end $$;

create or replace function public.zhixu_record_daily_quote_revision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_revision bigint;
begin
  next_revision := nextval('public.server_revision_seq');
  new.server_revision := next_revision;
  insert into public.sync_changes(
    revision, user_id, entity_type, entity_id, operation, payload
  ) values (
    next_revision,
    new.user_id,
    'daily_quote',
    new.id,
    case when new.deleted_at is null then 'upsert' else 'delete' end,
    to_jsonb(new) - 'user_id'
  );
  return new;
end;
$$;

drop trigger if exists zhixu_revision_trigger on public.daily_quotes;
create trigger zhixu_revision_trigger
  before insert or update on public.daily_quotes
  for each row execute function public.zhixu_record_daily_quote_revision();

alter function public.zhixu_apply_operation(jsonb)
  rename to zhixu_apply_operation_v9;

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
    return query select * from public.zhixu_apply_operation_v9(operation);
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
      id, user_id, text, local_date, reaction, generated_at, created_at,
      updated_at, deleted_at, device_id
    ) values (
      entity_key,
      current_user_id,
      incoming_payload->>'text',
      (incoming_payload->>'local_date')::date,
      coalesce(incoming_payload->>'reaction', 'none'),
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

alter function public.sync_snapshot() rename to sync_snapshot_v9;

create or replace function public.sync_snapshot()
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select snapshot || jsonb_build_object(
    'entities',
    coalesce(snapshot->'entities', '{}'::jsonb) || jsonb_build_object(
      'daily_quote',
      coalesce((
        select jsonb_agg(to_jsonb(q) - 'user_id')
        from public.daily_quotes q
        where q.user_id = auth.uid()
      ), '[]'::jsonb)
    )
  )
  from (select public.sync_snapshot_v9() as snapshot) previous;
$$;

revoke all on table public.daily_quotes from public;
grant select, insert, update, delete on table public.daily_quotes to authenticated;
revoke all on function public.zhixu_record_daily_quote_revision() from public;
revoke all on function public.zhixu_apply_operation_v9(jsonb) from public;
revoke all on function public.zhixu_apply_operation(jsonb) from public;
revoke all on function public.sync_snapshot_v9() from public;
revoke all on function public.sync_snapshot() from public;
grant execute on function public.zhixu_apply_operation(jsonb) to authenticated;
grant execute on function public.sync_snapshot_v9() to authenticated;
grant execute on function public.sync_snapshot() to authenticated;

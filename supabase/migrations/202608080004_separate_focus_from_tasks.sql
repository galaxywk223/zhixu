update public.focus_sessions
set linked_task_id = null,
    updated_at = now()
where source = 'tomatodo'
  and linked_task_id is not null;

update public.tasks
set is_archived = true,
    deleted_at = coalesce(deleted_at, now()),
    updated_at = now()
where external_source = 'tomatodo'
  and deleted_at is null;

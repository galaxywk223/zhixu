alter publication supabase_realtime drop table public.projects;

drop table if exists public.projects;

alter table public.tasks drop column if exists project_id;
alter table public.schedule_blocks drop column if exists project_id;
alter table public.notes drop column if exists project_id;
alter table public.focus_sessions drop column if exists linked_project_id;

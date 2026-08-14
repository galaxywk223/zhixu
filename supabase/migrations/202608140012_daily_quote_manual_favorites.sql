alter table public.daily_quotes
  drop constraint if exists daily_quotes_source_kind_check;
alter table public.daily_quotes
  add constraint daily_quotes_source_kind_check
    check (source_kind in ('ai', 'corpus', 'manual', 'favorite'));

alter table public.daily_quotes
  drop constraint if exists daily_quotes_text_check;
alter table public.daily_quotes
  add constraint daily_quotes_text_check
    check (char_length(text) between 1 and 80);

update public.daily_quotes
set deleted_at = coalesce(deleted_at, now()),
    updated_at = greatest(updated_at, now())
where source_kind = 'corpus'
  and reaction <> 'favorite'
  and deleted_at is null;

-- Equipment lists and schedules become library shelves.
--
-- Both already had templates — a row with is_template and a name — but no home
-- to browse them in, so a saved template was only visible from inside the one
-- course picker that offered it. Saving one was write-only: no rename, no
-- delete, no way back in to fix a line.
--
-- They're structured rows, not documents, so they can't move into
-- library_items (source_type/url/drive_file_id are shaped for links). Instead
-- they take the library's *vocabulary* — description, disciplines, topics — and
-- the library page reads them from their own tables as two more shelves beside
-- Maps and Teaching material.

alter table public.gear_lists
  add column if not exists description text,
  add column if not exists disciplines text[] not null default '{}',
  add column if not exists topics      text[] not null default '{}';

alter table public.course_schedules
  add column if not exists description text,
  add column if not exists disciplines text[] not null default '{}',
  add column if not exists topics      text[] not null default '{}';

-- Filtering a shelf by discipline is the point of tagging it, and both shelves
-- are browsed by that first.
create index if not exists gear_lists_disciplines_idx
  on public.gear_lists using gin (disciplines);
create index if not exists course_schedules_disciplines_idx
  on public.course_schedules using gin (disciplines);

comment on column public.gear_lists.description is
  'What this list is for — shown on the library shelf, not to students.';
comment on column public.course_schedules.description is
  'What this schedule is for — shown on the library shelf, not to students.';

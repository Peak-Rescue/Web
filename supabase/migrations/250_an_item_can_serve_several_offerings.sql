-- One offering was the wrong shape. The ACA swiftwater materials serve both
-- swiftwater offerings; a manual for the aerial kit serves every course that
-- carries it. Forcing the choice to one meant either tying it to the wrong
-- one or leaving it untied, and untied means "reached for by expertise",
-- which is the broader answer this column exists to narrow.
--
-- Expand only: course_type stays until the code that reads it is gone, so a
-- deploy in either order keeps working. See 242 for why the column is
-- usually empty.
alter table public.library_items
  add column if not exists course_types text[] not null default '{}';

update library_items
set course_types = array[course_type]
where course_type is not null and course_types = '{}';

create index if not exists library_items_course_types_idx
  on public.library_items using gin (course_types);

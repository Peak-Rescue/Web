-- Who is driving this course.
--
-- Not the crew — the admin whose job it is to move it down the pipeline:
-- get it staffed, get the quote out, get it billed, close its books. A course
-- with nobody's name on it is the one that stalls, because everybody assumes
-- somebody else is driving it, and until now the portal had no way to say so.
--
-- Nullable on purpose. Unassigned is a real state and a useful one — the
-- courses list draws it as its own kind of alarm — so it must not be faked
-- with a default that puts somebody's name on a course they never took on.
--
-- `on delete set null`: somebody leaving does not take their courses'
-- histories with them, it just leaves those courses needing a new owner.

alter table public.course_instances
  add column if not exists owner_id uuid references public.profiles(id) on delete set null;

comment on column public.course_instances.owner_id is
  'The admin responsible for moving this course along — staffing, quote, billing, books. Null means nobody has taken it on, which the courses list shows as an alarm rather than as a blank.';

-- Read on every render of the courses list, filtered on, and never more than a
-- handful per person.
create index if not exists course_instances_owner_id_idx
  on public.course_instances (owner_id)
  where owner_id is not null;

-- A course is a span of days, and a staff session is an hour on a Wednesday.
--
-- The weekly in-house class — somebody teaches at the facility at 0900, and
-- the instructors out of town call in — had nowhere to live once the Google
-- calendars were taken away from the crew. An internal course is the nearest
-- thing the portal has, and it was missing four facts: when in the day it
-- starts, where to call in, that everyone is welcome rather than only the
-- people staffed on it, and that it happens again next week.
--
-- All four are additive and null/false for every course that exists.

alter table public.course_instances
  add column if not exists start_time time,
  add column if not exists video_url text,
  add column if not exists all_staff boolean not null default false,
  add column if not exists series_id uuid;

comment on column public.course_instances.start_time is
  'When in the day it starts, on the office clock (Mountain). Only offered on an internal course; null is an all-day course like any other.';
comment on column public.course_instances.video_url is
  'Where to call in. On an all-staff session this is what the calendar chip opens for anyone who is not on the crew and so cannot open the course page.';
comment on column public.course_instances.all_staff is
  'An internal course is otherwise seen only by the people added to it. True puts it on every instructor''s calendar without staffing them on it — no pay row, no clash.';
comment on column public.course_instances.series_id is
  'Shared by the courses one "repeats weekly" create made, so they can be found again as a set. Nothing reads it yet.';

create index if not exists course_instances_all_staff_idx
  on public.course_instances (starts_at) where all_staff;

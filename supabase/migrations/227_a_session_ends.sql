-- A start time is enough for the portal's calendar, which only ever prints
-- when to turn up. Google's draws an event as a block, and a block needs a
-- bottom edge.
--
-- Null means an hour, which is what the weekly staff class is. Additive.

alter table public.course_instances
  add column if not exists end_time time;

comment on column public.course_instances.end_time is
  'When a timed internal course finishes, on the office clock. Null with a start_time set means one hour — it only decides how tall the Google Calendar event is drawn.';

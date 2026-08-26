-- Which day the meeting point is for.
--
-- The block held a point and an hour, and the announcement about it could only
-- say the plan was "now set" — fine when it is sent the night before, thin
-- when it goes out a week ahead of a five-day course, and useless on the
-- second course a student is enrolled on. The day was knowable all along
-- (day one, nearly always) and simply never said.
--
-- Nullable, and read with the course start as the fallback: every row that
-- exists today means day one, and backfilling would freeze that guess into
-- data rather than leaving it as one.
alter table public.course_instances
  add column if not exists meeting_date date;

comment on column public.course_instances.meeting_date is
  'Day the meeting point applies to. Null means the course start date.';

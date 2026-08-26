-- Which meeting days have actually been announced.
--
-- "The meeting point has changed" was decided by comparing the saved fields
-- with the ones before them, which is the wrong question on a course that sets
-- tomorrow's plan every evening: nothing changed, it is a different day. Every
-- send after the first would have told a student their plan had moved, and the
-- one time it really had would have read the same as all the others.
--
-- The real question is whether these people have already been told about this
-- day. That is a fact about what went out, not about what is stored, so it has
-- to be written down when it goes out.
alter table public.course_instances
  add column if not exists meeting_announced_dates date[] not null default '{}';

comment on column public.course_instances.meeting_announced_dates is
  'Meeting days already announced to the course. Presence here is what makes a further announcement for that day a change rather than the plan arriving.';

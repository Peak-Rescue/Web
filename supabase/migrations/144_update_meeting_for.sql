-- Marks an update as the notice about a meeting point, and which day for.
--
-- A course that posts tomorrow's plan every evening ends the week with five
-- near-identical notices in the feed, each of them a pointer rather than a
-- message — they deliberately never quote the plan, so that the block stays
-- the only copy. Yesterday's is worse than noise: it points at a block that
-- now describes a different day.
--
-- Only the newest is shown. The rest stay here rather than being deleted,
-- because the row is where "10 people were emailed, at this time" is recorded,
-- and that is worth keeping long after the notice stops being worth reading.
alter table public.course_updates
  add column if not exists meeting_for date;

comment on column public.course_updates.meeting_for is
  'Set when this update is the meeting-point notice for that day. Superseded by any later one; older notices are kept for the email record but hidden from the feed.';

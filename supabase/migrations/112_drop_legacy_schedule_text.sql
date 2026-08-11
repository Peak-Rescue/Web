-- The free-text "Schedule / running order" box is gone.
--
-- Schedules are built now — days with their own location and notes, topics
-- with sub-topics, saveable as a template — so the textarea beside it was a
-- second place to answer the same question, and the one people would reach
-- first because it sat in the form they were already filling in.
--
-- Nothing is lost: the column was empty on every course when this ran. Had it
-- held anything, this would be a backfill into course_schedules instead.

alter table public.course_instances drop column if exists schedule;

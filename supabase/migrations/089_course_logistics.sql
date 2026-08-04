-- Per-delivery logistics: where to meet, when, and the running order.
--
-- This is the one kind of course content that doesn't belong in the library.
-- Curriculum is evergreen and reused by discipline; venue packs are reused by
-- place; but the meeting point and schedule are authored fresh every delivery,
-- never reused, and actively dangerous when stale — a student driving to last
-- year's trailhead. Library items would mean hundreds of single-use rows with
-- no way to tell which course's meeting point you were reading.
--
-- These are participant-facing by definition: everyone on the course sees them.

alter table public.course_instances
  add column if not exists meeting_point text,
  add column if not exists meeting_time  text,
  add column if not exists schedule       text;

comment on column public.course_instances.meeting_point is
  'Where participants meet on day one — participant-facing.';
comment on column public.course_instances.meeting_time is
  'When they meet on day one, free text ("0700, be ready to walk").';
comment on column public.course_instances.schedule is
  'Running order for the course — participant-facing.';

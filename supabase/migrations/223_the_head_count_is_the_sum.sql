-- instructor_slots stops being written and starts being computed.
--
-- 220 made it the sum of the three seat counts, kept in step by the app. That
-- works exactly as long as every writer remembers, and there were two of them.
-- A total that can disagree with its parts eventually will, and the disagreement
-- is silent: the estimate quotes one number while the crew plan says another.
--
-- Deliberately ordered the other way round from every other migration here. A
-- migration lands before its deploy, and a column that refuses writes would
-- break course creation for every build still writing one — so the writes were
-- removed and deployed first, and this follows.
--
-- Null is preserved rather than collapsed to zero, and that is the whole care in
-- this file. Twenty-three courses have no crew plan at all, seventeen of them
-- with crew on the ground, and plannedInstructorCount falls back to the roster
-- when this is null. Coalescing to 0 would quietly re-price every one of them at
-- a single instructor.

alter table public.course_instances
  drop column instructor_slots,
  add column instructor_slots integer
    generated always as (
      case
        when lead_slots is null and assist_slots is null and shadow_slots is null then null
        else coalesce(lead_slots, 0) + coalesce(assist_slots, 0) + coalesce(shadow_slots, 0)
      end
    ) stored;

comment on column public.course_instances.instructor_slots is
  'How many instructors the course is planned around — computed from lead_slots, assist_slots and shadow_slots and not writable. Null when the crew has never been broken down, which readers take as "ask the roster" rather than "nobody". 208 allowed a fraction here for "a lead and somebody cheaper"; that is a shadow seat now and counts as a whole person.';

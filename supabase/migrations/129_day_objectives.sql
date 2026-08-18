-- Objectives are written twice over: once for the course, and once for the
-- day. A five-day course's overall objectives are too coarse to teach from —
-- what an instructor reads the morning of is what this day is meant to leave
-- students able to do.
alter table public.schedule_days
  add column if not exists objectives text[] not null default '{}';

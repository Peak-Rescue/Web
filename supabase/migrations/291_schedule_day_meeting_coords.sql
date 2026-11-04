-- A day's own pin, for a morning that meets somewhere it wrote out rather than
-- at a saved meeting point. Until now only a saved meeting point could hold a
-- pin, so a one-off place had to be saved to the library to get one.
alter table public.schedule_days
  add column if not exists meeting_coords text;

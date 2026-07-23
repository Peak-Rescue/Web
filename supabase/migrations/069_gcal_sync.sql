-- Google Calendar mirror: each course tracks its event and which of the
-- three course calendars (military / civilian / prospective) it lives on,
-- so status changes can move it and cancellation can remove it.

alter table public.course_instances
  add column if not exists gcal_event_id text,
  add column if not exists gcal_calendar_id text;

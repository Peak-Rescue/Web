-- A morning can carry its own pins.
--
-- 149 and 150 gave a schedule day an hour and a meetup, on the assumption that
-- the links were covered: the driving pin belongs to the meetup and the route
-- page and gauge belong to the canyon, both of them written once and shown
-- live. That holds for the standing case and misses the actual one.
--
-- What a real morning looked like: a map link, a route page and a water gauge
-- pinned to one day, alongside "planning on running Knucklehead without a
-- rescue component". Two of those three could have lived on the site — and
-- should, next time — but the ability to hang something on a single morning is
-- used, and the day had nowhere to put it.
--
-- Same two columns as course_instances, deliberately: the meeting block is one
-- component with one shape, and the only thing that varies is which row it is
-- attached to.
alter table public.schedule_days
  add column if not exists meeting_links       jsonb not null default '[]'::jsonb,
  add column if not exists meeting_attachments jsonb not null default '[]'::jsonb;

comment on column public.schedule_days.meeting_links is
  'Links pinned to this morning — the one-off. Standing links live on the site or its meetup.';
comment on column public.schedule_days.meeting_attachments is
  'Files pinned to this morning, in the same private bucket as the course''s own.';

-- meeting_note, added in 149, is not used: what it was for — "the shuttle, the
-- gate code, who's driving" — is what people already write in the meeting
-- point itself, and a second prose box beside the first is a choice nobody
-- wants to make at 0500. Left in place rather than dropped: it has never been
-- written to, and dropping a column is a separate, later breath from adding
-- one.
comment on column public.schedule_days.meeting_note is
  'Unused. The meeting point prose carries this; drop when convenient.';

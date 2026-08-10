-- Courses point at a venue properly, instead of the admin pages fuzzy-matching
-- free-text location against venue names. That match was the reason
-- /admin/venues could promise "maps, permits and rescue plans attach here once"
-- while nothing reliably attached: rename the venue, or type the location a
-- little differently, and the link silently vanished.

alter table public.course_instances
  add column if not exists venue_id uuid references public.venues on delete set null;

create index if not exists course_instances_venue on public.course_instances (venue_id);

comment on column public.course_instances.venue_id is
  'The venue this course runs at. Its library material (maps, permits, rescue plans) is suggested to the course.';

-- Venues get the same structured region as courses and library items, so a
-- venue can seed a course''s region when one is picked. The existing free-text
-- `region` column ("North Bend, WA") stays as the human label.
alter table public.venues add column if not exists region_code text;

comment on column public.venues.region_code is
  'ISO region code (US-WA, CA-BC, FR). The free-text `region` column remains the human-readable label.';

-- Backfill only where the course location is exactly a venue name. The
-- substring matching the app did at runtime is too loose to freeze into data —
-- an unmatched course simply gets no suggestions, which is recoverable; a
-- wrongly matched one looks correct and is not.
update public.course_instances c
set venue_id = v.id
from public.venues v
where c.venue_id is null
  and c.location is not null
  and lower(btrim(c.location)) = lower(btrim(v.name));

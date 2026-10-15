-- A canyon with no venue over it.
--
-- Beta is one shape — a name, the write-up, the coordinates, the route page
-- and the gauge — and it was only that shape under a venue, because a site
-- hangs off a venue and nothing else. Above one, "add beta" had to fall back
-- to a library row with a title and a link, which is a different and poorer
-- thing wearing the same button.
--
-- So a site can name its region directly. It belongs to the smallest named
-- place there is: a venue when there is one, the state when there is not.
-- Both can be set — the venue answers for the state — and `venue_id` stays
-- the one the schedule day reads, untouched.
alter table public.sites
  add column if not exists region_code text;

create index if not exists sites_region_idx on public.sites (region_code) where venue_id is null;

comment on column public.sites.region_code is
  'The state or country this sits in when there is no venue over it. Derived from the venue when there is.';

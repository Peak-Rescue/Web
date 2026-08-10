-- Where a course happens, as a code instead of typed prose. `location` stays
-- the free-text place name; `region` is the part that has to match exactly.
-- Maps carry the same code, so a map tagged US-HI reaches every Hawaii course
-- however its location was spelled — replacing the fuzzy venue-name match.
--
-- ISO: 'US-WA' / 'CA-BC' for subdivisions, plain 'FR' for a country. Codes are
-- validated in lib/regions.ts rather than by a check constraint, so a new
-- country never needs a migration.

alter table public.course_instances add column if not exists region text;
alter table public.library_items    add column if not exists region text;

comment on column public.course_instances.region is
  'ISO region code for the course location (US-WA, CA-BC, FR). Free-text location holds the place name.';
comment on column public.library_items.region is
  'ISO region code this item covers — the match used to suggest maps to a course in the same region.';

-- Suggestion reads maps by region, so index the lookup rather than the column.
create index if not exists library_items_map_region
  on public.library_items (region)
  where bucket = 'map';

-- Venues already carry a free-text region; seed course regions from nothing
-- rather than guessing at it — a wrong code matches confidently, which is
-- worse than an empty one that simply offers no suggestions.

-- Weather and contacts for a state or a country, not just for a venue.
--
-- A venue holds four things: maps, beta, weather and contacts. The first two
-- work at any level already, because they are library rows with a place on
-- them and the place can be a region — a map of Washington is filed to
-- Washington. The other two are columns on `venues`, so they stop at the
-- venue, and there is nowhere to put the state-wide avalanche forecast or the
-- number for a ranger district that covers four venues.
--
-- Keyed by the region code rather than by a row of its own, so there is no
-- second list of states to keep in step with the codes everything else uses.
-- A row appears the first time something is put on a region and not before.
create table if not exists public.region_info (
  region_code text primary key,
  -- Same shapes as the venue's, so one editor serves both and a link means
  -- the same thing wherever it is read.
  links      jsonb not null default '[]'::jsonb,
  contacts   jsonb not null default '[]'::jsonb,
  notes      text,
  updated_at timestamptz not null default now()
);

alter table public.region_info enable row level security;
create policy "region_info: admin" on public.region_info for all using (public.is_admin());

comment on table public.region_info is
  'Weather, contacts and notes for a whole state or country. The venue-level equivalents live on venues.';

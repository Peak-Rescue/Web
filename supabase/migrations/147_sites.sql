-- Canyons, crags and towers, as things that outlive the day they're run on.
--
-- Emerald's approach time, rap count and exit don't change between courses,
-- but they lived in schedule_days.notes — so the beta was retyped per course,
-- and when a plan shifted the beta had to be hand-carried from one day to the
-- next. A site holds what's true about the place; the day's notes hold only
-- what's true about that day ("skip the 1st rap", "2 guides and 6 clients").
--
-- Unlike gear lists and schedule templates, this is a reference, not a copy:
-- correcting a rap count once corrects it everywhere it's shown. A day that
-- needs to disagree overrules it by writing its own beta, the same way a
-- course overrules the library on who can see a map.
--
-- Venues are the region a course is sold against ("Maui", "North Bend"); a
-- site is a place inside one. The link is optional, because a site can be
-- found before anyone decides which venue it belongs under.

create table if not exists public.sites (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid references public.venues(id) on delete set null,
  name       text not null,                   -- "Emerald Canyon (Upper)"
  -- Free text rather than a check: the vocabulary here is still growing, and
  -- a constraint would mean a migration every time a new kind of place shows
  -- up on a schedule.
  kind       text,                            -- "canyon", "climb", "tower"
  beta       text,                            -- approach, raps, exit, hazards
  coords     text,                            -- "20.7988, -156.1193"
  -- Route page, gauge, driving pin — the same three links this kind of day
  -- already carries on the course's meeting point.
  links      jsonb not null default '[]'::jsonb,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sites_venue_idx on public.sites (venue_id);
create index if not exists sites_name_idx  on public.sites (lower(name));

-- A day keeps its free-text location alongside this. Days that aren't at a
-- named site ("Classroom", "Rappel Maui") never pick one, and days that do
-- still show the location line if someone wants to be more specific than the
-- site's own name.
alter table public.schedule_days
  add column if not exists site_id uuid references public.sites(id) on delete set null;

create index if not exists schedule_days_site_idx on public.schedule_days (site_id);

alter table public.sites enable row level security;
create policy "sites: admin" on public.sites for all using (public.is_admin());

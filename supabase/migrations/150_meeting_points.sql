-- Where we meet is not always where we are going.
--
-- 149 put the meeting point on the site, on the grounds that it is decided by
-- which canyon we are dropping into. That is true right up until it isn't:
-- one trailhead services several canyons, and often we meet somewhere with
-- parking and carpool from there to a place with none. Emerald Upper and
-- Emerald Lower share a meetup. A gas station serves three canyons and is
-- itself no canyon at all.
--
-- So a meetup is its own row. A site says which one it usually uses, a day can
-- say otherwise, and correcting a gate code corrects it for every canyon that
-- meets there — the same bargain the beta already makes, drawn around the
-- thing that actually varies.
create table if not exists public.meeting_points (
  id         uuid primary key default gen_random_uuid(),
  -- What we call it out loud: "Hanawi lower lot", "the Shell in Haiku".
  name       text not null,
  -- Which region it serves, for ordering the picker the way sites are ordered
  -- — a Maui course shouldn't scroll past every lot in Washington.
  venue_id   uuid references public.venues(id) on delete set null,
  -- The sentence someone reads at 0500: where to turn, where to park, what to
  -- look for.
  directions text,
  -- The pin you drive to. On a site this was ambiguous; here it is the whole
  -- point of the row.
  coords     text,
  -- The driving pin, the gate-code page. The canyon's own links — Ropewiki,
  -- Mountain Project, the gauge — stay on the site: those are about the
  -- descent, and these are about getting to the start of the day.
  links      jsonb not null default '[]'::jsonb,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meeting_points_venue_idx on public.meeting_points (venue_id);

-- The same single policy sites carries: admins write, and every reader that
-- matters — the portal, the schedule PDF — goes through the service role.
alter table public.meeting_points enable row level security;
create policy "meeting_points: admin" on public.meeting_points for all using (public.is_admin());

-- The usual meetup for a place, and the exception for one morning.
alter table public.sites
  add column if not exists meeting_point_id uuid references public.meeting_points(id) on delete set null;

alter table public.schedule_days
  add column if not exists meeting_point_id uuid references public.meeting_points(id) on delete set null;

create index if not exists sites_meeting_point_idx on public.sites (meeting_point_id);
create index if not exists schedule_days_meeting_point_idx on public.schedule_days (meeting_point_id);

comment on column public.sites.meeting_point_id is
  'The meetup this place usually uses. A schedule day can point somewhere else.';
comment on column public.schedule_days.meeting_point_id is
  'This day meets here instead of the site''s usual. Free-text meeting_point still beats both.';

-- Carry over anything already typed on a site, one row per distinct wording so
-- that two canyons sharing a meetup end up sharing the row rather than each
-- keeping a copy of the same sentence — which is the case that prompted all
-- this. Coords come along with the first site that had them.
insert into public.meeting_points (name, venue_id, directions, coords)
select
  -- Named after the first site that used it, since nobody has given these
  -- names yet. Renaming one is a text edit on a screen that now exists.
  min(s.name) || ' meetup',
  min(s.venue_id::text)::uuid,
  s.meeting_point,
  min(s.coords)
from public.sites s
where s.meeting_point is not null and btrim(s.meeting_point) <> ''
group by s.meeting_point;

update public.sites s
set meeting_point_id = mp.id
from public.meeting_points mp
where mp.directions = s.meeting_point
  and s.meeting_point is not null
  and btrim(s.meeting_point) <> ''
  and s.meeting_point_id is null;

-- sites.meeting_point stays for now and is dropped once the code that reads it
-- is deployed — the app in production still knows only 149's shape, and a
-- column removed before its reader is a course page that 404s.
comment on column public.sites.meeting_point is
  'Superseded by meeting_point_id. Kept until the reading code ships; drop then.';

-- Clients become a list we file under, not a string we retype.
--
-- course_instances.client_name is free text, and the same squadron has been
-- typed four ways. This is the list those strings will be attached to. It is
-- not an org chart: nobody is going to keep track of which command a team
-- belongs to this year. The top level is a set of bins (PJs, Industrial, Ski
-- areas…) chosen so the right client is quick to find, and a client sits in a
-- bin, with teams under the unit they belong to where that is worth knowing.
--
-- What keeps the next booking from creating a duplicate is `aliases`: the
-- words people actually type ("Marine" for MARSOC, "SERE" for AETC 336) plus
-- every old spelling from client_name, so a search finds the client whatever
-- it was called. Courses are not linked here yet; that comes with the picker.
--
-- `note` holds the doubt a reviewer should see ("placement guessed") without
-- putting question marks into names that will later sit on quotes.
create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  -- Restrict, not cascade: deleting a bin must never quietly delete every
  -- client filed in it.
  parent_id   uuid references public.clients(id) on delete restrict,
  name        text not null check (length(trim(name)) > 0),
  aliases     text[] not null default '{}',
  note        text,
  -- Bins are ordered by hand; everything under a bin sorts by name.
  position    integer not null default 0,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Two "24 STS" under one parent is always a mistake. The same name under two
-- different parents (a "Ski Patrol" under each resort) is not.
create unique index if not exists clients_name_per_parent
  on public.clients (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(name)));
create index if not exists clients_parent_idx on public.clients (parent_id);

drop trigger if exists clients_updated_at on public.clients;
create trigger clients_updated_at
  before update on public.clients
  for each row execute procedure set_updated_at();

-- Who has looked at a client and agrees with where it sits. One row per
-- person, so three people checking is three ticks rather than one shared
-- "Confirmed" that the last person to touch it overwrote.
create table if not exists public.client_signoffs (
  client_id  uuid not null references public.clients(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, profile_id)
);

alter table public.clients         enable row level security;
alter table public.client_signoffs enable row level security;
drop policy if exists "clients: admin" on public.clients;
create policy "clients: admin" on public.clients for all using (public.is_admin());
drop policy if exists "client_signoffs: admin" on public.client_signoffs;
create policy "client_signoffs: admin" on public.client_signoffs for all using (public.is_admin());
grant select, insert, update, delete on public.clients         to authenticated;
grant select, insert, update, delete on public.client_signoffs to authenticated;

-- ─── Seed: the draft reviewed in "Client Tree — Draft for Review", Oct 2026 ──
-- Only when empty, so re-running this never duplicates the list.
do $$
declare
  pj uuid; mil uuid; le uuid; sar uuid; ski uuid; tram uuid; ind uuid; film uuid;
  sts24 uuid;
begin
  if exists (select 1 from public.clients) then return; end if;

  insert into public.clients (name, position) values ('PJs', 1)                            returning id into pj;
  insert into public.clients (name, position) values ('Special ops and other military', 2) returning id into mil;
  insert into public.clients (name, position) values ('Law enforcement', 3)                returning id into le;
  insert into public.clients (name, position) values ('SAR and medical', 4)                returning id into sar;
  insert into public.clients (name, position) values ('Ski areas and patrols', 5)          returning id into ski;
  insert into public.clients (name, position) values ('Tramways and parks', 6)             returning id into tram;
  insert into public.clients (name, position) values ('Industrial', 7)                     returning id into ind;
  insert into public.clients (name, position) values ('Film and events', 8)                returning id into film;

  insert into public.clients (parent_id, name, aliases, note) values
    (pj, '24 STS', array['CAG','PJ','special tactics','Air Force','24th STS'], 'May belong under Special ops / CAG')
    returning id into sts24;

  insert into public.clients (parent_id, name, aliases, note) values
    (sts24, 'Red Team',    '{}',                         'Placement guessed'),
    (sts24, 'Blue Team',   array['24 STS Blue Team'],    null),
    (sts24, 'Gold Team',   '{}',                         'Placement guessed'),
    (sts24, 'Silver Team', '{}',                         null),
    (pj,  'STS Air Commando Branch', array['Air Commando','CAG','24th STS Air Commando Branch'],
          'New? May sit alongside the 24 STS, supporting CAG'),
    (pj,  '23 STS',  array['PJ','special tactics','PJ at the 23rd STS','23rd STS'], null),
    (pj,  '38 RQS',  array['PJ','rescue squadron','38th RQS'], null),
    (pj,  '48 RQS',  array['PJ','rescue squadron'], null),
    (pj,  '131 RQS', array['PJ','rescue squadron','Guard'], null),

    (mil, 'CAG',      '{}', null),
    (mil, 'SOCOM',    array['USSOCOM','USSOCOM SOCOM'], null),
    (mil, 'MARSOC',   array['Marine','Marines','Raiders','MSORD','MARSOC MSORD'], 'What is MSORD?'),
    (mil, 'SOCC',     '{}', null),
    (mil, 'SOMWTC',   '{}', null),
    (mil, 'AETC 336', array['SERE'], null),
    (mil, 'Maritime Security Response Team – East', array['MSRT','Coast Guard','Maritime Security Response Team - East'], null),

    (le,  'Indiana State Police', array['ISP','Indiana Sate Police'], null),
    (le,  'Denver SWAT', array['Denver Police'], null),
    (le,  'San Bernardino County Sheriff – Aviation Unit',
          array['SBSD','San Bernardino County Sheriff''s Department Emergency Operations Division - Aviation Unit'], null),

    (sar, 'Albany County SAR', '{}', null),
    (sar, 'Olympic Mountain SAR', '{}', null),
    (sar, 'STOW Mountain Rescue', '{}', null),
    (sar, 'Summit County SAR', array['Summit County Search and Rescue'], null),
    (sar, 'Wilderness Medics Inc.', '{}', null),

    (ski, 'Purgatory', array['ski patrol','Purgatory ski patrol'], null),
    (ski, 'Bridger Bowl', array['Bridger Bowl Ski Area'], null),
    (ski, 'Crystal Mountain', array['Crystal Mountain Ski Resort'], null),
    (ski, 'Sugar Bowl', '{}', null),

    (tram, 'Goldbelt Tramway', array['Juneau'], null),
    (tram, 'Tramway Properties', '{}', null),
    (tram, 'TNT', array['Calgary','TNT and Darcy'], 'Guessed from "TNT and Darcy"; Darcy is our instructor'),

    (ind, 'PAR Montana', '{}', null),
    (ind, 'American Colloid', '{}', null),
    (ind, 'Basin Power Plant', '{}', null),
    (ind, 'Red Trail Energy', '{}', null),
    (ind, 'Jardine Construction', '{}', null),
    (ind, 'Lineage', '{}', null),
    (ind, 'Microsoft', '{}', null),
    (ind, 'Rocky Mountain Communication Systems', array['RMCS'], null),
    (ind, 'TechTera, LLC', array['TechTera'], null),

    (film, 'Dancing with the Stars', array['DWTS'], 'Probably billed to a production company'),
    (film, 'Visit Casper', '{}', null);
end $$;

-- Content library: the portal home for material currently spread across 37
-- Google Classroom classes (473 items, 1,063 attachments).
--
-- Shape follows what the Classroom crawl actually showed:
--   · one item per resource, referenced by many courses (134 Drive files are
--     currently duplicated across classes, so edits silently go stale)
--   · venues are first-class — maps, permits, lodging and hospital info repeat
--     per location (Dingford, North Bend, Leavenworth, Maui…), not per class
--   · two visibility levels replace the "(DO NOT POST)" topic convention
--   · provenance is kept so every imported row can be traced back and reviewed
--
-- Files stay in Drive; the portal links (and proxies student-facing reads).
-- All access is via server actions on the service-role client, so RLS here is
-- a deny-by-default backstop.

-- ─── Venues ─────────────────────────────────────────────────────────────────
create table if not exists public.venues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  region      text,                    -- "North Bend, WA"
  client_name text,                    -- standing client sites (Icy Straight, Mighty Argo)
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists venues_name_idx on public.venues (lower(name));

-- ─── Library items ──────────────────────────────────────────────────────────
create table if not exists public.library_items (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,

  -- Source. url is the canonical/view link (or storage path for uploads);
  -- edit_url is the internal-only twin CalTopo/SARTopo maps carry, kept on the
  -- same row so the edit link can never be published by mistake.
  source_type  text not null default 'link'
               check (source_type in ('drive', 'link', 'youtube', 'file')),
  url          text,
  edit_url     text,
  drive_file_id text,

  kind         text not null default 'reference',
  audience     text not null default 'internal' check (audience in ('internal', 'shared')),

  disciplines  text[] not null default '{}',   -- capability categories
  topics       text[] not null default '{}',   -- free-form tags
  venue_id     uuid references public.venues(id) on delete set null,

  expires_at   date,                            -- permits and dated documents
  reviewed_at  timestamptz,

  -- Review workflow: imports land as 'pending' and are never visible to
  -- instructors or participants until an admin publishes them.
  status       text not null default 'published'
               check (status in ('pending', 'published', 'archived')),

  -- Provenance back to Google Classroom, so a reviewer can see where a row
  -- came from and proposed labels can be judged in context.
  source_class text,
  source_topic text,
  source_item  text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists library_items_status_idx     on public.library_items (status);
create index if not exists library_items_venue_idx      on public.library_items (venue_id);
create index if not exists library_items_disciplines_idx on public.library_items using gin (disciplines);
create index if not exists library_items_topics_idx     on public.library_items using gin (topics);

-- ─── Auto-attach defaults (course type → item) ──────────────────────────────
-- Mirrors course_task_templates / pricing_rates default_line: items flagged
-- for a course type come along automatically when that course is created.
create table if not exists public.library_defaults (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.library_items(id) on delete cascade,
  course_type text not null,
  created_at  timestamptz not null default now(),
  unique (item_id, course_type)
);

create index if not exists library_defaults_type_idx on public.library_defaults (course_type);

-- ─── What's attached to a course ────────────────────────────────────────────
create table if not exists public.instance_materials (
  id          uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.course_instances(id) on delete cascade,
  item_id     uuid not null references public.library_items(id) on delete cascade,
  -- Per-course override; null inherits the item's own audience.
  audience    text check (audience in ('internal', 'shared')),
  sort_order  int not null default 0,
  added_by    uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (instance_id, item_id)
);

create index if not exists instance_materials_instance_idx on public.instance_materials (instance_id);

-- ─── RLS: deny by default, admin-only backstop ──────────────────────────────
alter table public.venues             enable row level security;
alter table public.library_items      enable row level security;
alter table public.library_defaults   enable row level security;
alter table public.instance_materials enable row level security;

create policy "venues: admin"             on public.venues             for all using (public.is_admin());
create policy "library_items: admin"      on public.library_items      for all using (public.is_admin());
create policy "library_defaults: admin"   on public.library_defaults   for all using (public.is_admin());
create policy "instance_materials: admin" on public.instance_materials for all using (public.is_admin());

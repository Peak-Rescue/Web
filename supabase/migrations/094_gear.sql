-- Gear lists, built from a catalog rather than retyped.
--
-- Today each course gets a fresh Google Doc that's then linked from Classroom.
-- The same items appear on list after list — helmet, harness, adjustable
-- lanyard — retyped every time, so a change to a recommendation never reaches
-- the lists already sent out.
--
-- Three tables: a catalog of gear the company uses, named lists (a template or
-- a course's own), and the entries that place catalog items into a list with
-- per-list overrides. Real lists showed what the entries need to carry:
-- category grouping ("Canyoning Gear", "Environmental Layers"), an info column,
-- a recommendation column, and a personal/group split.

create table if not exists public.gear_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  info        text,                       -- what it's for
  recommended text,                       -- the spec we suggest
  url         text,                       -- product page or spec sheet
  category    text,                       -- default grouping
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists gear_items_name_idx on public.gear_items (lower(name));

create table if not exists public.gear_lists (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  -- Student and instructor lists differ; some courses need both.
  audience     text not null default 'student' check (audience in ('student', 'instructor')),
  intro        text,                       -- the "why" paragraph real lists open with
  -- A template (no course) or a course's own list.
  instance_id  uuid references public.course_instances(id) on delete cascade,
  is_template  boolean not null default false,
  course_type  text,                       -- offering this template belongs to
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists gear_lists_instance_idx on public.gear_lists (instance_id);
create index if not exists gear_lists_template_idx on public.gear_lists (is_template, course_type);

create table if not exists public.gear_list_entries (
  id           uuid primary key default gen_random_uuid(),
  list_id      uuid not null references public.gear_lists(id) on delete cascade,
  -- From the catalog, or a one-off typed straight onto this list.
  gear_item_id uuid references public.gear_items(id) on delete set null,
  name         text,                       -- used when there's no catalog item
  info         text,                       -- overrides the catalog's
  recommended  text,
  url          text,
  category     text,                       -- overrides the catalog's grouping
  group_type   text not null default 'personal' check (group_type in ('personal', 'group')),
  quantity     text,                       -- "2", "20 ft", "1 per team"
  sort_order   int not null default 0
);

create index if not exists gear_entries_list_idx on public.gear_list_entries (list_id);

alter table public.gear_items       enable row level security;
alter table public.gear_lists       enable row level security;
alter table public.gear_list_entries enable row level security;

create policy "gear_items: admin"   on public.gear_items       for all using (public.is_admin());
create policy "gear_lists: admin"   on public.gear_lists       for all using (public.is_admin());
create policy "gear_entries: admin" on public.gear_list_entries for all using (public.is_admin());

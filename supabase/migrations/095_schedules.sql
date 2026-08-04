-- Course schedules, built in the portal rather than in a Google Doc.
--
-- Two real schedules set the shape. The Taiwan 10-day outline opens with
-- numbered learning objectives, then each day is a run of timed blocks —
-- "Classroom AM 3 hrs", "Skill Station", "In Canyon PM 5 hrs". The 4-day Urban
-- Mobility outline has no times at all: each day is a title, a location, a note
-- ("Bring tactical gear"), then topics nested two deep — "Rappel methods and
-- practice" over eight sub-items.
--
-- So: times are optional, nesting is not, and a day carries its own location
-- and notes independent of its blocks.
--
-- Same copy-not-reference model as gear lists: a template copied onto a course
-- becomes that course's own, and editing it can't rewrite the template.

create table if not exists public.course_schedules (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- The overview paragraph both real schedules open with.
  overview    text,
  -- Learning objectives, listed above the days. Taiwan numbers them; Urban
  -- Mobility folds them into the overview prose, so this can be empty.
  objectives  text[] not null default '{}',
  -- A template (no course) or a course's own schedule.
  instance_id uuid references public.course_instances(id) on delete cascade,
  is_template boolean not null default false,
  course_type text,                       -- offering this template belongs to
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists course_schedules_instance_idx on public.course_schedules (instance_id);
create index if not exists course_schedules_template_idx on public.course_schedules (is_template, course_type);

create table if not exists public.schedule_days (
  id          uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.course_schedules(id) on delete cascade,
  title       text not null default 'Day',   -- "Day 1: Basic Rope Skills, Rappelling, Ascension"
  location    text,                          -- "TBD", "Classroom + Garfield Ledges"
  notes       text,                          -- "Bring tactical gear"
  sort_order  int not null default 0
);

create index if not exists schedule_days_schedule_idx on public.schedule_days (schedule_id);

create table if not exists public.schedule_blocks (
  id         uuid primary key default gen_random_uuid(),
  day_id     uuid not null references public.schedule_days(id) on delete cascade,
  -- Sub-topics hang off their parent topic. One level of nesting is all the
  -- real schedules use, but nothing here enforces that.
  parent_id  uuid references public.schedule_blocks(id) on delete cascade,
  title      text not null,
  time_label text,                           -- "AM 3 hrs", "0700–1200" — free text, often absent
  location   text,                           -- "Classroom", "In Canyon" when it differs from the day
  sort_order int not null default 0
);

create index if not exists schedule_blocks_day_idx on public.schedule_blocks (day_id);
create index if not exists schedule_blocks_parent_idx on public.schedule_blocks (parent_id);

alter table public.course_schedules enable row level security;
alter table public.schedule_days    enable row level security;
alter table public.schedule_blocks  enable row level security;

create policy "schedules: admin" on public.course_schedules for all using (public.is_admin());
create policy "sched days: admin" on public.schedule_days   for all using (public.is_admin());
create policy "sched blocks: admin" on public.schedule_blocks for all using (public.is_admin());

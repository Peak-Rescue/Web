-- Reference attached to a course: the med plan, the evacuation annex, a permit,
-- a tech note for this place. Same shape as course_maps, and for the same
-- reason — these belong to a delivery in a location, not to a course type.
-- A Maui med plan must not ride a template into a Wyoming course, so this
-- lives per-instance and templates never touch it.
--
-- Why not a curriculum item: a resource is something you reach for during the
-- course, not material you are taught. On the portal it gets its own section
-- so a student can tell the two apart at a glance.
--
-- A row is either a library item (reusable, edits propagate) or a one-off link
-- pasted for this delivery — never both, matching course_maps.

create table if not exists public.course_resources (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  instance_id     uuid not null references public.course_instances on delete cascade,
  library_item_id uuid references public.library_items on delete cascade,
  url             text,
  label           text,
  audience        text not null default 'internal' check (audience in ('internal', 'shared')),
  sort_order      int  not null default 0,
  added_by        uuid references public.profiles on delete set null,

  constraint course_resources_item_or_url check ((library_item_id is null) <> (url is null))
);

-- The same document twice on one course is a mistake, not a use case.
create unique index if not exists course_resources_unique_item
  on public.course_resources (instance_id, library_item_id)
  where library_item_id is not null;

create index if not exists course_resources_instance
  on public.course_resources (instance_id, sort_order);

-- Answering "which courses is this document on?" for the Drive proxy, which
-- asks by item rather than by course.
create index if not exists course_resources_item
  on public.course_resources (library_item_id);

alter table public.course_resources enable row level security;

-- Admins and the course team can read; writes go through server actions.
-- Students reach shared resources through the portal page, which reads with
-- the service role and applies the audience filter itself.
drop policy if exists "course_resources: team read" on public.course_resources;
create policy "course_resources: team read"
  on public.course_resources for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.instance_instructors ii
      join public.instructors i on i.id = ii.instructor_id
      where ii.instance_id = course_resources.instance_id
        and i.profile_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.course_resources to authenticated;

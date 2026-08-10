-- Maps attached to a course, chosen where the course's location is set.
--
-- A row is either a library map (the reusable venue map, edit twin and all)
-- or a one-off link pasted for this delivery — never both, same shape as
-- course_documents' path/url split. Visibility reuses the library's own
-- audience vocabulary rather than inventing a second one: 'shared' reaches
-- students, 'internal' stays with the team.

create table if not exists public.course_maps (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  instance_id     uuid not null references public.course_instances on delete cascade,
  library_item_id uuid references public.library_items on delete cascade,
  url             text,
  label           text,
  audience        text not null default 'internal' check (audience in ('internal', 'shared')),
  sort_order      int  not null default 0,
  added_by        uuid references public.profiles on delete set null,

  -- Library map or pasted link, exactly one.
  constraint course_maps_item_or_url check ((library_item_id is null) <> (url is null))
);

-- The same map twice on one course is a mistake, not a use case.
create unique index if not exists course_maps_unique_item
  on public.course_maps (instance_id, library_item_id)
  where library_item_id is not null;

create index if not exists course_maps_instance on public.course_maps (instance_id, sort_order);

alter table public.course_maps enable row level security;

-- Admins and the course team can read; writes go through server actions.
-- Students reach shared maps through the portal page, which reads with the
-- service role and applies the audience filter itself.
drop policy if exists "course_maps: team read" on public.course_maps;
create policy "course_maps: team read"
  on public.course_maps for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.instance_instructors ii
      join public.instructors i on i.id = ii.instructor_id
      where ii.instance_id = course_maps.instance_id
        and i.profile_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.course_maps to authenticated;

-- The 'map' bucket has never been settable from the admin UI, so every map
-- imported or created so far landed in 'resource' and the Maps library reads
-- empty. Kind is the reliable signal — move those across.
update public.library_items set bucket = 'map'
  where kind = 'map' and bucket = 'resource';

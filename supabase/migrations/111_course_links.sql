-- One-off links attached to a course: the shared photo album, the client's own
-- paperwork, a permit portal, a weather page.
--
-- Reusable material already has a home — library items, picked onto a course
-- through Curriculum, with disciplines and topics so they're findable again.
-- These are the opposite: a link that means something for this delivery and
-- nothing for the next one, which is why the current answer is pasting it into
-- the notes field and hoping.
--
-- Shape follows course_maps deliberately: a label, a url, and a per-row
-- audience, because the honest answer is per link — the photo album goes to
-- students, the client's site survey does not.

create table if not exists public.course_links (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  instance_id uuid not null references public.course_instances on delete cascade,
  -- What kind of thing this is, so the course page can group them rather than
  -- showing one undifferentiated pile.
  purpose     text not null default 'resource'
                check (purpose in ('photos', 'resource', 'form', 'other')),
  label       text,
  url         text not null,
  audience    text not null default 'internal' check (audience in ('internal', 'shared')),
  sort_order  int  not null default 0,
  added_by    uuid references public.profiles on delete set null
);

create index if not exists course_links_instance on public.course_links (instance_id, purpose, sort_order);

-- The same link twice on one course is a mistake, not a use case.
create unique index if not exists course_links_unique_url
  on public.course_links (instance_id, url);

alter table public.course_links enable row level security;

-- Admins and the course team can read; writes go through server actions.
-- Students reach shared links through the portal page, which reads with the
-- service role and applies the audience filter itself.
drop policy if exists "course_links: team read" on public.course_links;
create policy "course_links: team read"
  on public.course_links for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.instance_instructors ii
      join public.instructors i on i.id = ii.instructor_id
      where ii.instance_id = course_links.instance_id
        and i.profile_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.course_links to authenticated;

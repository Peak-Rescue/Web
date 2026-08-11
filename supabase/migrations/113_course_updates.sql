-- Updates posted to the people on a course, and emailed to them.
--
-- Course info answers "what is this course" and is edited in place — a student
-- who read it last week has no way to know the meeting point moved. An update
-- is the other thing: dated, addressed, and pushed. "Rain forecast Thursday,
-- bring the drysuit." "We're meeting at the lower lot, not the trailhead."
--
-- Distinct from course_instances.notes, which is the team's own scratchpad and
-- never leaves the staff view.
--
-- The email is the point, so what happened to it is recorded on the row: how
-- many people it reached, and when. A post whose email failed is still a post,
-- and the person who wrote it needs to know the difference.

create table if not exists public.course_updates (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  instance_id uuid not null references public.course_instances on delete cascade,
  body        text not null,
  created_by  uuid references public.profiles on delete set null,
  -- Null until an email attempt completes; set even when every send failed, so
  -- "we tried" and "we never tried" stay distinguishable.
  emailed_at  timestamptz,
  sent_count  int not null default 0,
  -- How many enrolled students existed at post time. sent_count below this
  -- means some address bounced or the key was missing.
  recipient_count int not null default 0
);

create index if not exists course_updates_instance
  on public.course_updates (instance_id, created_at desc);

alter table public.course_updates enable row level security;

-- Anyone on the course can read: enrolled students, assigned instructors,
-- admins. Writes go through the server action, which is stricter.
drop policy if exists "course_updates: course read" on public.course_updates;
create policy "course_updates: course read"
  on public.course_updates for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.enrollments e
      where e.instance_id = course_updates.instance_id and e.user_id = auth.uid()
    )
    or exists (
      select 1 from public.instance_instructors ii
      join public.instructors i on i.id = ii.instructor_id
      where ii.instance_id = course_updates.instance_id
        and i.profile_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.course_updates to authenticated;

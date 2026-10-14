-- The weekly staff class replaces a spreadsheet: anyone could write their name
-- against a date and say what they would teach, and everyone could see the
-- whole list. Two facts the portal had nowhere to keep.
--
-- Who is coming. One answer per person per week, yes or no; no row is no
-- answer. Keyed on the instructor rather than the login because the people a
-- meeting is for are the roster, and the reminder email goes to the roster's
-- address.
--
-- What a teacher is teaching. A week can have several, each on their own
-- topic, so it belongs to the crew row and not to the course. Null on every
-- course that is a course.

create table if not exists public.meeting_rsvps (
  id            uuid primary key default gen_random_uuid(),
  instance_id   uuid not null references public.course_instances on delete cascade,
  instructor_id uuid not null references public.instructors on delete cascade,
  going         boolean not null,
  updated_at    timestamptz not null default now(),
  unique (instance_id, instructor_id)
);

create index if not exists meeting_rsvps_instructor_idx
  on public.meeting_rsvps (instructor_id);

alter table public.meeting_rsvps enable row level security;

drop policy if exists "meeting_rsvps: admin all" on public.meeting_rsvps;
create policy "meeting_rsvps: admin all"
  on public.meeting_rsvps for all using (public.is_admin());

drop policy if exists "meeting_rsvps: instructors read own" on public.meeting_rsvps;
create policy "meeting_rsvps: instructors read own"
  on public.meeting_rsvps for select using (
    exists (
      select 1 from public.instructors
      where id = meeting_rsvps.instructor_id
        and profile_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.meeting_rsvps to authenticated;

alter table public.instance_instructors
  add column if not exists topic text;

comment on column public.instance_instructors.topic is
  'What this person is teaching, on an internal meeting where several people can each take a slot. Written by the teaching sign-up sheet; null on a course.';

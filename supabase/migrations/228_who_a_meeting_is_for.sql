-- Between "everyone" and "the crew" there was nobody.
--
-- An internal meeting is seen by all staff, or only by the people staffed on
-- it. A leads' meeting is neither: it is for six people, and staffing them on
-- it to make it visible would put a course in each one's upcoming list and
-- raise a double-booking against whatever they are teaching that day.
--
-- So a meeting can name who it is for. A row here puts the meeting on that
-- instructor's calendar and does nothing else — no seat, no wage, no clash.
-- Same shape as course_interest_invites, without the asking: nobody answers
-- an invitation to a meeting, they turn up.

create table if not exists public.meeting_invites (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  instance_id   uuid not null references public.course_instances on delete cascade,
  instructor_id uuid not null references public.instructors on delete cascade,
  unique (instance_id, instructor_id)
);

create index if not exists meeting_invites_instructor_idx
  on public.meeting_invites (instructor_id);

alter table public.meeting_invites enable row level security;

drop policy if exists "meeting_invites: admin all" on public.meeting_invites;
create policy "meeting_invites: admin all"
  on public.meeting_invites for all using (public.is_admin());

drop policy if exists "meeting_invites: instructors read own" on public.meeting_invites;
create policy "meeting_invites: instructors read own"
  on public.meeting_invites for select using (
    exists (
      select 1 from public.instructors
      where id = meeting_invites.instructor_id
        and profile_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.meeting_invites to authenticated;

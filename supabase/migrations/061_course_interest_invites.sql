-- Staffing interest invites: admins email instructors a tokenized link to
-- express interest in working a course. One row per instructor per course so
-- re-sends reuse the same link. interested: null = no response yet.

create table if not exists public.course_interest_invites (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  instance_id   uuid not null references public.course_instances on delete cascade,
  instructor_id uuid not null references public.instructors on delete cascade,
  token         uuid not null default gen_random_uuid(),
  sent_at       timestamptz,
  sent_count    int not null default 0,
  responded_at  timestamptz,
  interested    boolean,
  note          text,
  unique (instance_id, instructor_id)
);

create unique index if not exists course_interest_invites_token_idx
  on public.course_interest_invites (token);

alter table public.course_interest_invites enable row level security;

drop policy if exists "course_interest_invites: admin all" on public.course_interest_invites;
create policy "course_interest_invites: admin all"
  on public.course_interest_invites for all using (public.is_admin());

drop policy if exists "course_interest_invites: instructors read own" on public.course_interest_invites;
create policy "course_interest_invites: instructors read own"
  on public.course_interest_invites for select using (
    exists (
      select 1 from public.instructors
      where id = course_interest_invites.instructor_id
        and profile_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.course_interest_invites to authenticated;

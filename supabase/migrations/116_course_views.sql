-- When each person last opened each course page.
--
-- The course page is almost entirely static — dates, curriculum, gear — and
-- updates are the one part that changes underneath a student. Without knowing
-- when they last looked, a posted update is indistinguishable from everything
-- that was already there, and the only way to find out whether anything moved
-- is to re-read the page.
--
-- One row per person per course, overwritten on every visit. Nothing here is
-- worth keeping history for.

create table if not exists public.course_views (
  user_id      uuid not null references public.profiles on delete cascade,
  instance_id  uuid not null references public.course_instances on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, instance_id)
);

alter table public.course_views enable row level security;

-- Yours and nobody else's. This says when someone read something, which is
-- not a thing other people on the course need to know.
drop policy if exists "course_views: own" on public.course_views;
create policy "course_views: own"
  on public.course_views for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.course_views to authenticated;

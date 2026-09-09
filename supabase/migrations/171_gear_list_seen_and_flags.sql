-- Whether the reader looked, and what they said when they were not happy.
--
-- ── Seen ────────────────────────────────────────────────────────────────
-- "Waiting on a check" says only that nobody has pressed the button, which
-- reads as "nobody has looked" and often is not: the list was read, and the
-- reader either had nothing to add or had no button to press. One row per
-- reader per list, so the ask can say "Micah opened it on Tuesday" instead
-- of leaving the asker to guess between not-yet and no-news.
--
-- Deliberately not on course_views: opening the course page is not opening
-- the gear list, and a signal that means the weaker thing is worse than none.
create table if not exists public.gear_list_views (
  user_id       uuid not null references public.profiles on delete cascade,
  list_id       uuid not null references public.gear_lists on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  times         integer not null default 1,
  primary key (user_id, list_id)
);

alter table public.gear_list_views enable row level security;

-- Yours and nobody else's, as with course_views. The gear panel reads other
-- people's through the service role, which the asker is entitled to see —
-- they asked — but that is the server's judgement to make, not a policy's.
drop policy if exists "gear_list_views: own" on public.gear_list_views;
create policy "gear_list_views: own"
  on public.gear_list_views for select
  using (user_id = auth.uid());

-- ── Flags ───────────────────────────────────────────────────────────────
-- A check had exactly one answer: yes. "Fine, but we are short two rope
-- bags" had to be squeezed into a sign-off note, which marks the list as
-- checked — so the one answer worth acting on was the one that closed the
-- question. A flag is an answer too: it says the reader looked and the list
-- is not ready, and it leaves the ask open on purpose.
--
-- review_note is shared with the sign-off: only the latest answer matters,
-- and two note columns would ask every reader of them which one is current.
alter table public.gear_lists
  add column if not exists review_flagged_at timestamptz,
  add column if not exists review_flagged_by uuid references public.profiles(id) on delete set null;

comment on column public.gear_lists.review_flagged_at is
  'When a reader last said the list is not ready. Cleared by a sign-off, which supersedes it.';

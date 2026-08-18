-- Read-only links to a course's student page, for people who should see it but
-- have no business having an account: the client's point of contact, an
-- instructor being sounded out before they're staffed.
--
-- Deliberately not the invite-link shape (a token column on course_instances,
-- one per course). You hand these to different people at different times, and
-- one shared token means killing the POC's link also kills the one you sent a
-- prospective instructor last week. A row each, revoked one at a time.
--
-- The token grants exactly what a student on that course sees — never more.
-- Nothing here records a role, because there is only one and widening it is
-- not a thing a link should be able to ask for.

create table if not exists public.course_view_shares (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  instance_id  uuid not null references public.course_instances on delete cascade,
  token        uuid not null default gen_random_uuid(),
  -- Who it went to, in your words. A list of five identical links is a list
  -- you can't revoke from — this is the column that makes the right one
  -- findable a month later.
  label        text,
  created_by   uuid references public.profiles on delete set null,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  -- First open and running total: enough to answer "did they ever look at it"
  -- without keeping a log of who read what.
  viewed_at    timestamptz,
  view_count   int not null default 0
);

create unique index if not exists course_view_shares_token_idx
  on public.course_view_shares (token);
create index if not exists course_view_shares_instance_idx
  on public.course_view_shares (instance_id);

alter table public.course_view_shares enable row level security;

-- Admin-only, like the invite links. The public page validates the token with
-- the service role — anon never queries this table.
drop policy if exists "course_view_shares: admin all" on public.course_view_shares;
create policy "course_view_shares: admin all"
  on public.course_view_shares for all using (public.is_admin());

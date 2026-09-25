-- A timesheet you can hand to the person who keys it in.
--
-- ADP will not take Nadav's own hours, so every pay period he writes the days
-- out in a spreadsheet and emails them to Micah, who types them in. The days
-- are already in the portal — which courses, which blocks, ten hours each —
-- so the spreadsheet is a transcription of something we know.
--
-- Two columns, both narrow on purpose:
--
-- `hours_via_admin` says the thing that is actually true of this person —
-- somebody else enters their hours — rather than naming them in code. It is
-- off for everyone else, and neither `salaried` nor `is_exempt` could have
-- stood in for it: Micah, Eric, Toph and Cody are all both, and all enter
-- their own.
--
-- `timesheets` holds one draft per person per pay period, rows and all. The
-- draft is generated from the courses, but the corrections are the point —
-- a day flown home early, two travel days instead of one — and a page that
-- forgot them on reload would be worse than the spreadsheet it replaces.

alter table public.instructors
  add column if not exists hours_via_admin boolean not null default false;

comment on column public.instructors.hours_via_admin is
  'True when this person cannot enter their own hours in ADP and an admin keys them in. Turns on the timesheet page at /instructor/hours. Not a pay question: salaried and exempt people mostly enter their own.';

create table if not exists public.timesheets (
  id            uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.instructors on delete cascade,
  period_start  date not null,
  period_end    date not null,
  -- The rows as edited: [{ date, hours, code, state, note }]. Flat json
  -- because nothing else in the portal ever queries inside a timesheet —
  -- it is written whole, read whole, and pasted into ADP by hand.
  rows          jsonb not null default '[]'::jsonb,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (instructor_id, period_start)
);

comment on column public.timesheets.sent_at is
  'When it was last handed off. The mail leaves from the person''s own inbox, so this is what they told us, not what we sent.';

alter table public.timesheets enable row level security;

drop policy if exists "timesheets: admin all" on public.timesheets;
create policy "timesheets: admin all"
  on public.timesheets for all using (public.is_admin());

drop policy if exists "timesheets: own" on public.timesheets;
create policy "timesheets: own"
  on public.timesheets for all using (
    exists (
      select 1 from public.instructors
      where id = timesheets.instructor_id and profile_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.timesheets to authenticated;

-- The one person this is for today.
update public.instructors
  set hours_via_admin = true
  where profile_id = '6c55ff58-5e8f-4631-a73d-37d42c7cceef';

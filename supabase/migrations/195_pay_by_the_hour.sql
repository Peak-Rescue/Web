-- Pay is hourly, and overtime is real.
--
-- 177 booked instructor pay at $500 a field day and $200 a travel day, which
-- is the right number for exactly one case: an exempt employee on a course
-- short enough that nobody passes 40 hours. Both halves of that are wrong
-- often enough to matter.
--
-- What is actually true:
--
--   · Everything is hourly. A field day is 10 hours at the person's own rate
--     — $50, $40 or $25 depending on who — and a travel day is 10 hours at
--     $20 for everybody. $500 and $200 were those two products, memorised.
--   · Non-exempt staff earn time and a half past 40 hours in a Sunday-to-
--     Saturday week. A travel day plus five field days is 60 hours, so a
--     normal week-long course already has 20 hours of overtime in it, and
--     the flat day rate was under-booking it by hundreds of dollars.
--   · Micah and Nadav are exempt, so their hours never earn the premium.
--     is_exempt (039) already knows who they are.
--
-- So pay stops being a rate per day and becomes a rate per hour, per person,
-- times the hours the course's own dates say each person worked. Three things
-- have to exist for that: the hourly rates people are actually on, whose rate
-- is whose, and the two shared constants (10 hours, 40 hours, 1.5×).
--
-- Nothing already saved moves. A pay line is a dollar amount somebody
-- accepted, and rewriting history from new arithmetic is how a closed course
-- stops matching the books it was closed against.

-- ─── Org-wide numbers now come in more than one unit ────────────────────────
-- 179's table held one row, a percentage, and the rates page multiplied every
-- value by 100 on the way in and out. $20 an hour would have shown as 2000.

alter table public.org_settings
  add column if not exists format text not null default 'percent'
    check (format in ('percent', 'money', 'hours', 'factor'));

comment on column public.org_settings.format is
  'How the value is written and read on the rates page: a percent is stored as a fraction (0.25 = 25%), everything else is stored as typed.';

insert into public.org_settings (key, value, label, unit, notes, format)
values
  (
    'pay_travel_hourly',
    20,
    'Travel hour',
    '$ / hour',
    'What a travel hour pays, the same for everybody. Field hours are per person — see the rates below.',
    'money'
  ),
  (
    'pay_hours_per_day',
    10,
    'Hours in a day',
    'hours / day',
    'What a field day and a travel day are each assumed to be. Long international travel is the exception, and gets edited on the line.',
    'hours'
  ),
  (
    'pay_ot_weekly_hours',
    40,
    'Overtime after',
    'hours / week',
    'Hours past this in a Sunday-to-Saturday week earn the premium. Exempt staff never do.',
    'hours'
  ),
  (
    'pay_ot_multiplier',
    1.5,
    'Overtime multiplier',
    '× the hourly',
    'What an overtime hour pays, as a multiple of the rate for the day it falls on.',
    'factor'
  )
on conflict (key) do nothing;

-- ─── The hourly rates people are on ─────────────────────────────────────────
-- A library of three numbers today, and a library rather than a check
-- constraint because a raise is a row, not a migration. The rate is its own
-- identity: two rows both saying $40 would be one rate entered twice.

create table if not exists public.pay_field_rates (
  hourly      numeric(8,2) primary key check (hourly > 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.pay_field_rates is
  'The field-day hourly rates somebody can be on. Offered as the choices when a person''s rate is set; retiring one leaves every rate already chosen alone.';

insert into public.pay_field_rates (hourly) values (50), (40), (25)
on conflict (hourly) do nothing;

-- Whose rate is whose. On instructors rather than profiles because the roster
-- is what gets staffed, and somebody can work a course before they ever log
-- in — an unlinked record still has to be paid.
alter table public.instructors
  add column if not exists field_hourly numeric(8,2);

comment on column public.instructors.field_hourly is
  'This person''s current field-day hourly. Null = nobody has said, and the course''s pay lines ask before they can be worked out. A course can override it for that course.';

-- What this person was paid at on this course, when it is not their current
-- rate: the rate changed mid-season, or a course was priced at a rate someone
-- agreed to for that job. Only the exceptions are stored — no row means
-- "their own rate", which is what nearly every course is.
create table if not exists public.course_pay_rates (
  instance_id   uuid not null references public.course_instances on delete cascade,
  instructor_id uuid not null references public.instructors on delete cascade,
  field_hourly  numeric(8,2) not null check (field_hourly > 0),
  created_at    timestamptz not null default now(),
  primary key (instance_id, instructor_id)
);

comment on table public.course_pay_rates is
  'Per-course override of a person''s field hourly. Absent = their rate on the instructors row.';

-- ─── A pay line shows its arithmetic ────────────────────────────────────────
-- The amount stays the one number the roll-up adds. Hours and the rate behind
-- it are recorded beside it so a line can be checked six months later without
-- the reader having to guess which of 50/40/25 and which multiplier produced
-- $2,750 — and so payroll can be handed hours, which is what ADP wants.

alter table public.course_pay_items
  add column if not exists hours       numeric(6,2),
  add column if not exists hourly_rate numeric(8,2);

comment on column public.course_pay_items.hours is
  'Hours behind the amount, where it was worked out from hours. Null on a line somebody just typed a total into, which is still allowed.';

comment on column public.course_pay_items.hourly_rate is
  'The rate those hours were paid at — the overtime premium already in it, so hours × rate = amount on every line that has both.';

-- ─── The quoted day rate is no longer a pay rate ────────────────────────────
-- pricing_rates.pay_rate did two jobs: it held what we pay, and its presence
-- marked a line as somebody's time so the estimate never seeded it as a cost
-- (see estimateCostSeed). The first job is gone — pay is hourly and per
-- person, and a single number on a library row cannot say that. The second
-- job has to survive, so it gets a column of its own first.

alter table public.pricing_rates
  add column if not exists own_time boolean not null default false;

comment on column public.pricing_rates.own_time is
  'Whether this line is somebody on the team rather than money leaving. Quoted at a padded rate on purpose, and never seeded into a course''s costs — what we actually pay comes from the hourly rates instead.';

update public.pricing_rates set own_time = true where pay_rate is not null;

-- And the day rates themselves go, so the rates page cannot show $500 beside
-- a calculation that no longer uses it. The column stays: a rate that is
-- somebody's time and is not paid by the hour (a contractor's day, an
-- evaluator) can still carry one.
update public.pricing_rates
  set pay_rate = null
  where own_time and label ~* 'instructor';

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- The rate library is read by any signed-in user, the same as org_settings —
-- both are needed wherever pay is worked out. What each person earns is not:
-- course_pay_rates is admin-only, like the rest of the actuals (177).

alter table public.pay_field_rates enable row level security;
alter table public.course_pay_rates enable row level security;

drop policy if exists "pay_field_rates: authenticated read" on public.pay_field_rates;
create policy "pay_field_rates: authenticated read"
  on public.pay_field_rates for select using (auth.uid() is not null);

drop policy if exists "pay_field_rates: admin write" on public.pay_field_rates;
create policy "pay_field_rates: admin write"
  on public.pay_field_rates for all using (public.is_admin());

drop policy if exists "course_pay_rates: admin all" on public.course_pay_rates;
create policy "course_pay_rates: admin all"
  on public.course_pay_rates for all using (public.is_admin());

-- ─── Explicit grants (see 029_explicit_grants.sql) ──────────────────────────

grant select, insert, update, delete on public.pay_field_rates to authenticated;
grant select, insert, update, delete on public.course_pay_rates to authenticated;

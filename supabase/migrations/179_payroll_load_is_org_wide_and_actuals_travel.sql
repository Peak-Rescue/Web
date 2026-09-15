-- Two changes to the actuals, both about numbers leaving the course they were
-- entered on.
--
-- 1. The payroll load is not a per-course fact.
--
--    177 put it on the course with a 25% default, which made every course its
--    own copy of one number: the rate changes, and there is nowhere to change
--    it. It belongs where the mileage rate and the meal rate already live —
--    one place, edited once, and every course follows.
--
--    Not a `pricing_rates` row, though it shares that page. A rate there is a
--    number you multiply a quantity by, and every one of them is offered as a
--    line to add to an estimate; "Payroll load, 25" in that list is a $25
--    estimate line waiting to be added by mistake. So: org-wide numbers that
--    are not rates get their own small table, shown in their own block.
--
--    The per-course column survives as an override, now nullable — null means
--    follow the org number, which is what nearly every course wants.
--
-- 2. The actuals travel: a link to send and a PDF to attach.
--
--    Same shape as a quote or a gear order — an unguessable token, minted only
--    when somebody asks for one, and revocable. Null until then, because a
--    course's profit and loss should not have a public address by default.

create table if not exists public.org_settings (
  key         text primary key,
  value       numeric not null,
  label       text not null,
  unit        text,
  notes       text,
  updated_at  timestamptz not null default now()
);

comment on table public.org_settings is
  'Org-wide numbers that are not rates — nothing here is multiplied by a quantity, so none of it belongs in pricing_rates where every row is an estimate line waiting to be added.';

insert into public.org_settings (key, value, label, unit, notes)
values (
  'payroll_load_pct',
  0.25,
  'Payroll load',
  '% on top of pay',
  'Taxes, insurance and the rest, as a multiplier on what people are paid. Course actuals add it to pay to reach the instructor-pay line; a course can override it.'
)
on conflict (key) do nothing;

alter table public.course_actuals alter column payroll_load_pct drop not null;
alter table public.course_actuals alter column payroll_load_pct drop default;

-- Every existing row carries the old column default, which would now read as
-- somebody having deliberately chosen 25% for that course rather than as
-- following the org. Nothing has been reconciled yet, so there is no judgment
-- here to preserve.
update public.course_actuals set payroll_load_pct = null where payroll_load_pct = 0.25;

comment on column public.course_actuals.payroll_load_pct is
  'Per-course override of the org-wide payroll load. Null = follow org_settings.payroll_load_pct, which is what nearly every course does.';

alter table public.course_actuals
  add column if not exists share_token uuid,
  add column if not exists share_created_at timestamptz;

create unique index if not exists course_actuals_share_token_idx
  on public.course_actuals (share_token) where share_token is not null;

comment on column public.course_actuals.share_token is
  'Unguessable address for the read-only actuals page, minted on request and revocable. Null = this course has no public address, which is the default.';

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Read by any signed-in user (the number is needed wherever pay is shown);
-- written by admins. The tokenised page reads through the service role, as
-- the quote and gear-order pages do.

alter table public.org_settings enable row level security;

drop policy if exists "org_settings: authenticated read" on public.org_settings;
create policy "org_settings: authenticated read"
  on public.org_settings for select using (auth.uid() is not null);

drop policy if exists "org_settings: admin write" on public.org_settings;
create policy "org_settings: admin write"
  on public.org_settings for all using (public.is_admin());

grant select, insert, update on public.org_settings to authenticated;

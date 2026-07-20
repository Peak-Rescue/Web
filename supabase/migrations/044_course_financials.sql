-- Course financials slice 1: the internal estimate calculator that produces
-- quote prices (replaces the per-client cost-estimate spreadsheets).
-- Strictly admin-only — instructors never see money.

-- ─── Pricing rates library (defaults for estimate line items) ───────────────

create table if not exists public.pricing_rates (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  label       text not null,
  unit        text,
  rate        numeric(10,2) not null default 0,
  sort_order  int not null default 0,
  active      boolean not null default true
);

insert into public.pricing_rates (label, unit, rate, sort_order)
values
  ('Instructor field day', 'per instructor per day', 700, 10),
  ('Instructor travel day', 'per instructor per day', 300, 20),
  ('Admin day', 'per day', 700, 30),
  ('Lodging', 'per person per night', 150, 40),
  ('Meals', 'per person per day', 68, 50),
  ('Vehicle rental', 'per day', 215, 60),
  ('Fuel', 'per day', 25, 70),
  ('Mileage', 'per mile', 0.73, 80),
  ('Flights', 'per person', 1000, 90),
  ('EMT / medical', 'per day', 470, 100),
  ('Classroom / venue', 'per day', 250, 110),
  ('Lift tickets', 'per person per day', 75, 120),
  ('Permits', 'per student', 15, 130),
  ('SWAG', 'per student', 30, 140),
  ('Miscellaneous', 'per day', 210, 150)
on conflict do nothing;

-- ─── Estimates (one per course instance) ────────────────────────────────────

create table if not exists public.course_estimates (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  instance_id  uuid not null unique references public.course_instances on delete cascade,
  -- Chosen per estimate (0.25 = 25%). No org-wide default by design.
  margin       numeric(5,4) not null default 0.25 check (margin >= 0)
);

create table if not exists public.estimate_items (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  estimate_id  uuid not null references public.course_estimates on delete cascade,
  label        text not null,
  qty          numeric(10,2) not null default 1,
  rate         numeric(10,2) not null default 0,
  sort_order   int not null default 0
);

-- ─── RLS: admin eyes only ───────────────────────────────────────────────────

alter table public.pricing_rates enable row level security;
alter table public.course_estimates enable row level security;
alter table public.estimate_items enable row level security;

drop policy if exists "pricing_rates: admin all" on public.pricing_rates;
create policy "pricing_rates: admin all"
  on public.pricing_rates for all using (public.is_admin());

drop policy if exists "course_estimates: admin all" on public.course_estimates;
create policy "course_estimates: admin all"
  on public.course_estimates for all using (public.is_admin());

drop policy if exists "estimate_items: admin all" on public.estimate_items;
create policy "estimate_items: admin all"
  on public.estimate_items for all using (public.is_admin());

grant select, insert, update, delete on public.pricing_rates to authenticated;
grant select, insert, update, delete on public.course_estimates to authenticated;
grant select, insert, update, delete on public.estimate_items to authenticated;

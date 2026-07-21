-- Unify reimbursement rates into the pricing rates library.
-- Expense reports and the course estimator both read the CURRENT library
-- price; each saved expense item already snapshots rate_used/amount, so
-- submitted reports keep their numbers when a rate changes. The separate
-- effective-dated expense_rates system (and the "per diem" concept) goes
-- away: meal coverage is simply the library's per-meal rate.

-- ─── Tag the library rows the expense system reads ──────────────────────────

alter table public.pricing_rates
  add column if not exists reimb_type text
  check (reimb_type in ('mileage', 'meal'));

-- At most one active row per reimbursement type.
create unique index if not exists pricing_rates_reimb_type_key
  on public.pricing_rates (reimb_type)
  where active and reimb_type is not null;

update public.pricing_rates
  set reimb_type = 'mileage'
  where active and reimb_type is null and label = 'Mileage';

-- Meals: one shared entry drives both client quotes and employee
-- reimbursement — $20 per meal (a full day is 3 meals).
update public.pricing_rates
  set reimb_type = 'meal', unit = 'per meal', rate = 20
  where active and reimb_type is null and label = 'Meals';

-- Safety net for environments missing either row.
insert into public.pricing_rates (label, unit, rate, sort_order, reimb_type)
select 'Mileage', 'per mile', 0.73, 80, 'mileage'
where not exists (select 1 from public.pricing_rates where active and reimb_type = 'mileage');

insert into public.pricing_rates (label, unit, rate, sort_order, reimb_type)
select 'Meals', 'per meal', 20, 50, 'meal'
where not exists (select 1 from public.pricing_rates where active and reimb_type = 'meal');

-- ─── Retire the effective-dated rate system ─────────────────────────────────

drop table if exists public.expense_rates;

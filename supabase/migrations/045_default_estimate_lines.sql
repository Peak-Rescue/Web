-- Rates flagged default_line are auto-added to a course's estimate when it's
-- first opened (the always-recurring costs: wages, travel, lodging). Rare
-- items (EMT, lift tickets…) stay in the picker.

alter table public.pricing_rates
  add column if not exists default_line boolean not null default false;

update public.pricing_rates
  set default_line = true
  where label in ('Instructor field day', 'Instructor travel day', 'Lodging', 'Mileage');

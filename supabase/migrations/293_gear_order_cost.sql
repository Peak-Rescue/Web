-- What a gear order's goods cost us, as a percent off the retail price: a pro
-- deal is said that way, and keeping it as a percent means a retail price
-- corrected later moves our cost with it. Per line, with an order-wide default
-- for the lines that do not say. Admin only — no read the team's page or PDF
-- makes names these columns.
alter table public.gear_order_lines
  add column if not exists cost_percent numeric(7,4) check (cost_percent >= 0 and cost_percent <= 100);

alter table public.gear_orders
  add column if not exists cost_percent numeric(7,4) check (cost_percent >= 0 and cost_percent <= 100);

-- Their discount gets the same precision, so a price typed in dollars
-- ("650 to them" on an 899 boot) comes back as that price rather than a cent
-- off it after the percent is rounded to two places.
alter table public.gear_order_lines alter column discount_percent type numeric(7,4);
alter table public.gear_orders alter column discount_percent type numeric(7,4);

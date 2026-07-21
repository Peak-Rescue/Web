-- Per-line notes on estimates ("quoted 3br cabin, confirm rate", vendor,
-- assumptions behind the number…).

alter table public.estimate_items
  add column if not exists notes text;

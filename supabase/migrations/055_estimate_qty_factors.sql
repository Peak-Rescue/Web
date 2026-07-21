-- Persist the qty-calculator breakdown on estimate lines (e.g. [3, 5] =
-- 3 people × 5 nights) so the math behind a quantity survives reloads.
-- Null = qty entered directly, no breakdown.

alter table public.estimate_items
  add column if not exists qty_factors jsonb;

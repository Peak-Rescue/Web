-- A COA's quote price is normally cost × (1 + margin), but real prices get
-- rounded ("$12,437" becomes "$12,500") or pinned to a number already given
-- verbally. price_override holds that hand-set number; null means use the
-- calculated one. It lives on the estimate rather than the quote so every
-- COA carries its own final price — which is what makes an options quote
-- (one option per COA) work without special-casing.
alter table public.course_estimates
  add column if not exists price_override numeric(12,2);

-- Which COA priced a quote. Quotes still snapshot their total at creation —
-- a sent quote must never move because someone edited a COA afterwards — so
-- this is what lets a draft pull the current number again on demand.
alter table public.course_quotes
  add column if not exists estimate_id uuid references public.course_estimates on delete set null;

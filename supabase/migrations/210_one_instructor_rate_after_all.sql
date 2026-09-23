-- 209's two rows come back out: the fraction won.
--
-- A fractional slot count does the same job with one rate instead of three,
-- and does one thing the extra rates could not: it tells staffing that half an
-- instructor is wanted. A line on a COA is invisible to the staffing panel,
-- so pricing a shadowing instructor that way would have quoted them correctly
-- and never asked anybody to find one.
--
-- The assistant row was redundant anyway — a $40/h assist is quoted at the
-- lead's buffered day rate on purpose, which is a decision about pricing, not
-- a rounding error.
--
-- What makes the fraction safe is the other half of this change, in
-- lib/estimates.ts paysFieldTime: the fraction reaches the field-day line and
-- nothing else. Every other cost counts whole people, including rates nobody
-- has added yet.
--
-- Deleted rather than retired, and only if nothing points at them: they were
-- added minutes ago and no estimate can have used one.

delete from public.pricing_rates r
 where r.label in ('Assistant instructor field day/s', 'Shadowing instructor field day/s')
   and not exists (select 1 from public.estimate_items i where i.rate_id = r.id);

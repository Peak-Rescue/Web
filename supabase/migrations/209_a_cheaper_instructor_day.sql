-- A buffered day rate for the crew who are not on the lead's hourly.
--
-- 750 is not a guess. A $50/h lead on a five-day course works 70 hours — a
-- travel day each side, ten hours each — and 30 of them are past the 40, so
-- the field days cost 50 straight and 75 premium. Loaded at 25%, that is
-- exactly $750 per field day. The buffer is the whole of it; the margin on the
-- COA is what earns anything.
--
-- The same arithmetic run at the other two hourlies in the library (195), on
-- the same five-day course:
--
--     $50/h → $750/day      $40/h → $600/day      $25/h → $375/day
--
-- Linear, because the premium is a multiple of the hourly and the payroll load
-- is a multiple of the whole thing. Only the travel day breaks the pattern: it
-- is $20/h for everybody, so one rate still covers the whole crew.
--
-- Long courses are the tight end, not the loose one: ten field days come to
-- $755/day at $50/h, because the second week has its own overtime. Three-day
-- courses come to $625. So 750 is right at a week and a shade under past it.
--
-- Two rows rather than a fraction of one. A fraction of the lead's rate
-- happens to be correct at $25/h — half of 750 — and is wrong at $40/h, where
-- it is 0.8, and wrong about every per-head cost on the course: a shadowing
-- instructor sleeps in a whole bed and takes a whole seat in the truck. A
-- mixed crew is a line each, and the course's slot count goes back to counting
-- people.
--
-- Nothing already quoted moves: these are new rows, off by default.

insert into public.pricing_rates (label, unit, rate, sort_order, own_time, default_line)
values
  ('Assistant instructor field day/s', 'per instructor per day', 600, 11, true, false),
  ('Shadowing instructor field day/s', 'per instructor per day', 375, 12, true, false)
on conflict do nothing;

-- 177 set the actual pay rates by exact label and matched nothing: the library
-- says "Instructor field day/s", plural-slashed, because the labels are prose
-- written by whoever added the rate.
--
-- Matched by meaning instead, which is the rule the reader already follows
-- (lib/actuals.ts payRatesFrom) and the rule the estimator's factor names
-- follow. Travel is claimed first and excluded from the field pattern: a day
-- of somebody's time is spelled "... day" either way, and a loose match on
-- the field line happily takes the travel row and pays a field day at 200.
--
-- The quoted rate stays what it is — 750 and 300 are padded on purpose. This
-- only records what the padding is padding: 500 and 200.

update public.pricing_rates
   set pay_rate = 200
 where active
   and pay_rate is null
   and label ilike '%travel%'
   and (label ilike '%instructor%' or label ilike '%day%');

update public.pricing_rates
   set pay_rate = 500
 where active
   and pay_rate is null
   and label not ilike '%travel%'
   and label ilike '%instructor%'
   and (label ilike '%field%' or label ilike '%day%');

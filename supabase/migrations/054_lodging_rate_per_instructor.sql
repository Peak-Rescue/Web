-- The default Lodging estimate line is instructor lodging (qty guessed as
-- instructors × nights); students arrange their own. Rename the unit so the
-- estimate reads "per instructor per night" instead of the ambiguous person.
update public.pricing_rates
  set unit = 'per instructor per night'
  where label = 'Lodging' and unit = 'per person per night';

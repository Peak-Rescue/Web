-- Permits are charged per student per day (qty = students × days).
update public.pricing_rates
  set unit = 'per student per day'
  where label = 'Permits' and unit = 'per student';

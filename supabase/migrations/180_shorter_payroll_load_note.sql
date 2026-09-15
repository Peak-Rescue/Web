-- The note under "Payroll load" on the rates page was three clauses long and
-- said what the actuals already show: that it is added to pay, and that a
-- course can override it. What the reader needs from it is what the number
-- covers.
update public.org_settings
   set value = value,
       label = 'Payroll load',
       unit = '% on top of pay',
       notes = 'Taxes, insurance and the rest.'
 where key = 'payroll_load_pct';

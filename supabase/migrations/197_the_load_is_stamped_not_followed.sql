-- A course's payroll load stops following the org-wide number.
--
-- 179 moved the load to org_settings and left each course's own column null,
-- meaning "follow the org". Read live, that number reaches backwards: put the
-- load up to 28% next season and the net on every course already reconciled —
-- and closed — moves with it, because none of them ever said 25% out loud.
-- The books would then disagree with the P&L they were closed against, and
-- nothing on screen would say why.
--
-- Everything else on this screen already works the other way round. A pay
-- line is a frozen amount, invoiced is a number somebody typed rather than
-- the quote read live, and a cost is what the receipt said. The load is the
-- last live figure in a page of settled ones.
--
-- So it is stamped instead: the org number is the starting point a course
-- takes when its actuals are first opened, and after that the course owns it.
-- The panel still offers today's org figure as one click, because deliberately
-- re-adopting it is a real thing to want — it just no longer happens behind
-- anybody's back.

-- Every existing row takes today's org figure, which is the only figure there
-- has ever been: 179 nulled these columns when 0.25 was both the org number
-- and the old column default, so stamping 0.25 back changes no total anywhere.
-- Courses started before the org row existed get the same number for the same
-- reason.
update public.course_actuals
  set payroll_load_pct = coalesce(
    (select value from public.org_settings where key = 'payroll_load_pct'),
    0.25
  )
  where payroll_load_pct is null;

comment on column public.course_actuals.payroll_load_pct is
  'What this course loaded pay at. Stamped from the org-wide number when the actuals were first opened, and this course''s own from then on — a later change to the org figure must not move a net somebody has already read. Null only in the window between a row appearing and being stamped, where the org figure still stands in.';

-- And the rates page stops describing it as the number every course follows.
update public.org_settings
  set notes = 'Taxes, insurance and the rest, as a multiplier on what people are paid. A course takes this figure when its actuals are first opened and keeps it — changing it here sets what the next course starts at, and moves nothing already reconciled.'
  where key = 'payroll_load_pct';

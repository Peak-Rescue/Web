-- We quote at 30%, not 25%.
--
-- The number lived in three places that had to agree: the column default, the
-- fallback coaPrice uses when a row carries no margin, and the first COA a
-- course is seeded with. The code side is one constant now (DEFAULT_MARGIN);
-- this is the column.
--
-- Existing rows keep whatever they were quoted at. A default is where a new
-- estimate starts, not a rate to apply backwards to work already priced.
alter table public.course_estimates alter column margin set default 0.30;

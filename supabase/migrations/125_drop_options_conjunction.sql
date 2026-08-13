-- Retire the second way of saying "and".
--
-- 124 put an operator on a line's product set, so "ATC Guide and Reverso" could
-- be written on one slot. It was the wrong shape: neither product could carry a
-- quantity, and "two ropes and one rope bag" is the ordinary case. Two things
-- you both need are two slots — which the branch structure already models, and
-- which is now what both "+ and" controls build.
--
-- Keeping both would have left the list with two ways to write the same claim,
-- differing only in whether the quantities survive. That is the exact overlap
-- the slot model was introduced to remove.
--
-- Deliberately a migration of its own, applied only once the code that stopped
-- selecting this column was live. A dropped column that live code still names
-- takes out every page reading it — here, the admin gear tab and every
-- student's course page.

alter table public.gear_list_entries
  drop constraint if exists gear_list_entries_options_conjunction;

alter table public.gear_list_entries
  drop column if exists options_conjunction;

-- Every expense line says what it was for.
--
-- Course actuals roll expense-report money up into a per-course profit and
-- loss, and a line with no course link breaks that quietly: the money is
-- spent, the course never sees it, and the net looks better than it is.
--
-- The fix is not "require a course" — some spending really is overhead, and
-- forcing those onto an arbitrary course would be worse than leaving them
-- loose. The fix is to make the absence deliberate. `non_course` says a
-- person looked at this line and decided it belongs to nobody; a null
-- instance_id with the flag false now means unclassified, which is a gap
-- somebody can go and close. Submission blocks on it (see the submit action)
-- — before this, a typed reason for travel was enough to file a report whose
-- every line was unattributable.
alter table public.expense_items
  add column if not exists non_course boolean not null default false;

comment on column public.expense_items.non_course is
  'Deliberately not tied to a course — overhead. Distinguishes a considered "no course" from an unfilled one: with this false and no instance_id (own or the report default), the line is unclassified and the report cannot be submitted.';

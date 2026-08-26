-- Undoes 144, which never carried a row.
--
-- The plan there was to keep one meeting notice in the feed and hide the rest.
-- The better answer is none: the email is what does the work, the block is the
-- plan, and a post between them could only say "there is something to go and
-- look at" — which is what the email says, in a place people are already
-- looking. So no post is written, and the column has nothing to mark.
--
-- Safe to drop rather than leave: no rows were ever written to it, and the
-- code that selected it is going out in the same breath.
alter table public.course_updates
  drop column if exists meeting_for;

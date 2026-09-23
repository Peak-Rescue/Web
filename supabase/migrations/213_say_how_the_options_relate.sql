-- A second COA has to say what it is to the first.
--
-- 212 let a COA name the one it is an addition to, and defaulted everything
-- else to standing on its own. That default is the wrong shape: "these two are
-- unrelated" is a real decision about what the client may accept, and it was
-- being made by not touching a dropdown. The quote that comes out is a set of
-- tick boxes, and which combinations of them are real money is exactly the
-- thing nobody wrote down.
--
-- Three answers, because three things actually happen:
--
--   standalone  — can be taken alone, and alongside anything else.
--   alternative — one of a set the client picks between. The drive team and
--                 the fly-in are the same course reached two ways; taking both
--                 is not a bigger course, it is two trips billed for one.
--   addition    — priced as the difference and taken on top of something else.
--                 Named, when it only makes sense on one option (the second
--                 week of a blended course, which the first week's travel gets
--                 the crew to). Unnamed, when it goes with whatever they take:
--                 the gear package a unit buys or does not, the same money
--                 whether they book one week or two.
--
-- Null means nobody has said yet. It is left null rather than defaulted so the
-- estimator is asked instead of assumed at, and a second COA on a course shows
-- it as unanswered the way a line with no quantity does. An options quote will
-- not be written while one is outstanding — that is the moment the tick boxes
-- become money.
--
-- Existing COAs are backfilled to standalone: that is what they have been
-- doing, and a quote already sent must not change meaning underneath a client.

alter table public.course_estimates
  add column if not exists relation text
    check (relation is null or relation in ('standalone', 'alternative', 'addition'));

comment on column public.course_estimates.relation is
  'What this COA is to the others on its course: standalone (alone or alongside anything), alternative (one of a set the client picks between), addition (priced as the difference, taken on top — of extends_id when it names one, of whatever they take when it does not). Null = not yet answered, which a course with a second COA shows as outstanding.';

-- An addition that already named its parent under 212 is an addition; anything
-- else has been standing on its own, which is what it keeps doing.
update public.course_estimates
   set relation = case when extends_id is not null then 'addition' else 'standalone' end
 where relation is null;

-- Only an addition may name a parent, so the two columns cannot disagree.
alter table public.course_estimates
  drop constraint if exists course_estimates_extends_needs_addition;
alter table public.course_estimates
  add constraint course_estimates_extends_needs_addition
    check (extends_id is null or relation = 'addition');

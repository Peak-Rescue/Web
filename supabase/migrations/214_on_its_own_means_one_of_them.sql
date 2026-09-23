-- Two answers, not four.
--
-- 213 offered four: standalone, either/or, addition to a named COA, addition to
-- whatever they take. Two of those existed for cases that turned out not to be
-- COAs at all. Gear is bought or not bought and has no course of its own to
-- price, so it stays where it already lives — a gear order with its own send
-- and its own response — rather than arriving here as a costed plan with a
-- margin. And either/or is not a third relationship: it is what standing on
-- your own already means.
--
-- So standalone becomes exclusive. Two COAs that each price a course on their
-- own are two ways of doing one job — the drive team and the fly-in, a week
-- here or a week in Washington — and taking both is not a bigger course, it is
-- two deployments billed as one. Anything genuinely additive is an addition,
-- which is the only way to combine and always names what it is added to.
--
-- Which leaves the picker at the question it actually is: is this a course on
-- its own, or is it something on top of one of the others?
--
--   standalone  a course the client can take. One of them, at most.
--   addition    priced as the difference, on top of the COA it names.
--
-- Nothing that has already gone out changes: a quote carries its own snapshot
-- of how its options relate, and the ones written before 213 carry none at all
-- and stay freely combinable, which is what their clients were shown.

update public.course_estimates set relation = 'standalone' where relation = 'alternative';

alter table public.course_estimates
  drop constraint if exists course_estimates_relation_check;
alter table public.course_estimates
  add constraint course_estimates_relation_check
    check (relation is null or relation in ('standalone', 'addition'));

-- An addition always says what it is added to. "On top of whatever they take"
-- was the gear case, and gear is not a COA.
alter table public.course_estimates
  drop constraint if exists course_estimates_extends_needs_addition;
alter table public.course_estimates
  add constraint course_estimates_extends_matches_relation
    check (
      (relation = 'addition' and extends_id is not null) or
      (relation <> 'addition' and extends_id is null) or
      relation is null
    );

update public.course_estimates set relation = null
 where relation = 'addition' and extends_id is null;

comment on column public.course_estimates.relation is
  'What this COA is to the others on its course: standalone (a course the client can take — at most one of them, since two whole courses on one quote are two deployments) or addition (priced as the difference, on top of the COA named by extends_id). Null = not yet answered, which a course with a second COA shows as outstanding.';

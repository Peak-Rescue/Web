-- One COA can price an addition to another, and then it cannot be bought alone.
--
-- 211 let a COA price part of a course, which made a blended quote possible:
-- a week of rescue, and a second week offered beside it. What it could not say
-- is how the two relate. Quote options are checkboxes that sum, so the client
-- could take the second week by itself — and the second week, priced as an
-- addition, carries no travel and no flights, because the trip is already paid
-- for by the first. Accepted alone it is a deployment nobody is flying to.
--
-- The inverse is the same bug from the other side: seed the second COA from the
-- default lines and it arrives with its own round trip, so a client taking both
-- pays to fly out twice.
--
-- So the relationship becomes a fact about the plan rather than a thing the
-- estimator has to remember. A COA that extends another can only be accepted
-- with it; the quote snapshots that when it is written, so re-pricing later
-- cannot lose it. One level only: an extension of an extension is a course
-- broken into pieces, which is what the course's own dates are for.
--
-- Null is the ordinary answer. Two COAs that extend nothing are alternatives
-- or additions on their own terms, exactly as before.

alter table public.course_estimates
  add column if not exists extends_id uuid references public.course_estimates on delete set null,
  add constraint course_estimates_extends_not_self
    check (extends_id is null or extends_id <> id);

comment on column public.course_estimates.extends_id is
  'The COA this one prices an addition to — its trip, its mobilization and its travel are already in that one, so it can only be accepted alongside it. Null = a COA that stands on its own.';

create index if not exists course_estimates_extends_idx
  on public.course_estimates (extends_id) where extends_id is not null;

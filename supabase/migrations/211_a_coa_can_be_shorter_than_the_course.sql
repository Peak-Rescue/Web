-- A COA can price part of the course.
--
-- Until now every COA on a course was priced against the course's own dates:
-- one span, one day count, one set of derived quantities. That is right for
-- the COAs this was built for — drive team against fly-in, the same days
-- arrived at differently — and wrong for the one that turned up: a blended
-- course quoted as a week of rescue with a second week of mountaineering
-- offered beside it. Those two options are not the same length.
--
-- Priced against the course's 15 days, the one-week COA's field-day line reads
-- as out of date on every visit — "days 8 → 15" — and the Update button that
-- sits beside the warning would quietly restore the two-week price. The line
-- was not stale. The COA was simply shorter than the course, and nothing could
-- say so.
--
-- Null means the course's own answer, the same as course_pay_rates (203): only
-- the exception is stored, so the COAs that price the whole course carry
-- nothing and keep following the dates when they move.
--
-- Off days are not copied. A break is a fact about the course, and
-- courseDayCounts already counts only the ones inside the window it is given,
-- so a COA covering the first week is unaffected by a break in the second.

alter table public.course_estimates
  add column if not exists starts_at date,
  add column if not exists ends_at   date,
  add constraint course_estimates_span_ordered
    check (starts_at is null or ends_at is null or ends_at >= starts_at);

comment on column public.course_estimates.starts_at is
  'First day this COA prices, when it is not the course''s. Null = the course''s own start.';

comment on column public.course_estimates.ends_at is
  'Last day this COA prices, when it is not the course''s. Null = the course''s own end.';

-- A pay line covers days, not a day.
--
-- course_pay_items has carried a single work_date since 177, when a line was
-- one figure somebody typed for a whole course and the date was decoration.
-- The hourly calculator writes four lines a person — field, field overtime,
-- travel, travel overtime — and each of those is a set of days: three days
-- straight and two at the premium, the drive out on one date and the drive
-- home on another a week later.
--
-- Written with no dates at all, which is what happened first, those lines
-- are unanswerable six months later: 30 hours at $50 for which three days?
-- And the dates are not a guess — the calculator knows exactly which days
-- went into each line, because which day an hour falls on is what decided
-- whether it was premium in the first place.

alter table public.course_pay_items
  add column if not exists end_date date;

comment on column public.course_pay_items.work_date is
  'First day this line covers. Null on a line nobody dated.';

comment on column public.course_pay_items.end_date is
  'Last day this line covers, when it spans more than one. Null = a single day, or a line nobody dated.';

-- What somebody earns an hour is a fact about the course, not about them.
--
-- 195 gave each person a standing hourly on their instructor row, with a
-- per-course override beside it. That has it backwards. The rate depends on
-- the job: what they are doing on this course, and what kind of course it is.
-- A lead on a SPRAT week and a second on a rec-level canyon day are not the
-- same rate, and the same person is both in the same month — so a standing
-- number would be overridden more often than it was followed, and every
-- course would have to be checked to find out which.
--
-- So there is one place a rate is set: the course's own pay rows, one per
-- person staffed, checked when the actuals are reconciled.

alter table public.instructors drop column if exists field_hourly;

comment on table public.course_pay_rates is
  'What this course pays each person an hour in the field. The only place that answer lives: the rate follows the role and the course type, so there is no standing rate to inherit.';

-- Which of the staffed crew a pay line is for. profile_id already says who,
-- for anybody with a portal account — but the roster is what gets staffed,
-- and somebody can work a course before they ever log in. The calculator has
-- to be able to find and re-price one person's lines when their rate changes,
-- and it cannot do that through a column that is null for half the crew.
alter table public.course_pay_items
  add column if not exists instructor_id uuid references public.instructors on delete set null;

comment on column public.course_pay_items.instructor_id is
  'Who on the roster this line pays, account or not. Null on a line typed for the whole crew, which is still allowed.';

create index if not exists course_pay_items_instructor_idx
  on public.course_pay_items (instance_id, instructor_id);

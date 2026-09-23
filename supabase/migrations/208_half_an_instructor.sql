-- Half an instructor is a real plan.

-- instructor_slots has been an integer since 014, which reads as "how many
-- bodies", and for staffing that is exactly right. But the same number is what
-- the estimator quotes instructor days against, and there the whole number is
-- a lie on any course that brings an assistant for part of it: a lead all week
-- plus somebody for the two hardest days is 1.5 instructors' worth of pay, not
-- 2. The cost calculator has always taken a fractional quantity on a line, so
-- the number the course itself carries was the only place the estimate had to
-- be rounded up — and rounding a quote up is not a rounding error.
--
-- So the count becomes fractional. Everything that counts people still counts
-- whole ones (1.5 slots is two names on the roster); everything that counts
-- money uses the number as written.

alter table public.course_instances
  alter column instructor_slots type numeric(5,2),
  add constraint course_instances_instructor_slots_positive
    check (instructor_slots is null or instructor_slots > 0);

comment on column public.course_instances.instructor_slots is
  'How many instructors the course is planned and quoted for. Fractional is '
  'deliberate: 1.5 is a lead plus an assistant for part of the course. '
  'Staffing rounds up to whole people; the estimator uses it as written.';

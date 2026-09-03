-- Whether the crew is paid through breaks, asked once per course.
--
-- 160 put this on each break, which turned out to be machinery for a case that
-- does not happen: paid through the first break and unpaid through the second.
-- What is real is one answer per course — the crew stays in the canyon over the
-- weekend and stays on the clock, or they go home and are off it. One checkbox
-- beside the calendar replaces a chip on every break, a merge rule for strokes
-- whose breaks disagreed, and the matching rule for a day two rows claimed.
--
-- Paid is the default: it is the norm, and it is the safer way to be wrong,
-- since an unmarked break quotes the client for the day rather than quietly
-- taking it off.
alter table course_instances
  add column if not exists breaks_paid boolean not null default true;

comment on column course_instances.breaks_paid is
  'Instructors are paid through this course''s breaks. False takes those days off the instructor days a client is quoted for; lodging and the vehicle span them either way.';

-- instance_off_days.instructors_paid is superseded and no longer read once the
-- app deploys. Left in place deliberately: the database moves before the code,
-- and dropping a column the running app still selects takes every course page
-- down with it. Dropped in a later migration, once this one is live.

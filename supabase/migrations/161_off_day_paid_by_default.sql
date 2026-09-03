-- A break is paid unless somebody says otherwise.
--
-- 160 defaulted this to false, on the assumption that a break meant the crew
-- was off the clock. Backwards: in the courses Peak Rescue actually runs, the
-- crew stays where they are over a weekend in the middle and stays on the
-- clock, so paid is the norm and unpaid is the exception marked on the break's
-- own row. The default follows the norm, which is also the safer way to be
-- wrong — an unmarked break quotes the client for the day rather than
-- silently taking it off.
--
-- Existing rows are left alone: there are no real breaks on any course yet,
-- only test ones, and rewriting somebody's answer is not something a default
-- change should do.
alter table instance_off_days
  alter column instructors_paid set default true;

comment on column instance_off_days.instructors_paid is
  'Instructors are paid through this break — the norm. False is the marked exception: the day comes off the instructor days a client is quoted for.';

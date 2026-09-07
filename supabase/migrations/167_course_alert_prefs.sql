-- Who hears about a course the moment it exists.
--
-- Until now the portal only emailed about a course once it was confirmed
-- (see announcesChanges in lib/course-notify.ts) — the right rule for the
-- crew, whose schedules a tentative date shouldn't churn. Admins are the
-- other case: a tentative course is exactly the thing they need to know
-- about, because tentative is when it can still be staffed, quoted and
-- talked out of a bad week.
--
-- Every admin gets every new course by default. The two filters below are
-- for narrowing, and an empty array means "no filter" rather than "nothing" —
-- so an admin who never opens this page keeps hearing about everything.

alter table public.instructors
  add column if not exists course_alerts boolean not null default true,
  add column if not exists course_alert_disciplines text[] not null default '{}',
  add column if not exists course_alert_sectors text[] not null default '{}';

comment on column public.instructors.course_alerts is
  'Admins only: email me when any course is created, in any status.';
comment on column public.instructors.course_alert_disciplines is
  'Capability categories to be alerted about. Empty = every discipline.';
comment on column public.instructors.course_alert_sectors is
  'Client sectors to be alerted about (civilian, military). Empty = both.';

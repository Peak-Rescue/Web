-- Somebody on salary is not a cost of the course they worked.
--
-- 195 priced everybody's days by the hour, which is right for the crew that
-- is paid for them. Micah is not: he is salaried, so a field day and a travel
-- day cost the course nothing extra, and an hourly checked against his name
-- would book money that was never paid on top of money that was.
--
-- This is the one part of pay that genuinely is a fact about the person
-- rather than the job. The rate they earn depends on the role and the course
-- type (196) — whether they earn one at all does not change from course to
-- course, so it sits on the roster row and is set on their page.
--
-- On instructors and not on profiles, where is_exempt lives, because somebody
-- can be staffed before they ever have an account and the crew table still
-- has to know not to price them.

alter table public.instructors
  add column if not exists salaried boolean not null default false;

comment on column public.instructors.salaried is
  'Paid a salary, so the field and travel days they work are not a cost of the course. Their pay lines come to nothing and no hourly is asked for.';

update public.instructors set salaried = true where slug = 'micah-rush';

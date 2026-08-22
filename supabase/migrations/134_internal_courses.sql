-- Instructor development and continuing education: courses we put on the
-- calendar for our own people, taught by someone we bring in. There is no
-- client and no student roster — everyone on it is crew, and the flag is what
-- lets the rest of the app work that out later (CE credit, who attended).
--
-- The immediate reason it exists: instructors' "All courses" calendar shows
-- every course matching expertise they hold, so a canyon course put on for
-- three people is visible to every canyon-qualified instructor, who then
-- wonders why they weren't asked. Internal courses are shown only to the crew
-- assigned to them.
--
-- Named `internal` rather than `audience` on purpose: `audience` already means
-- student-facing vs instructor-facing on course content (modules, items, maps,
-- resources), and a second meaning on the instance would read as the same one.
alter table public.course_instances
  add column if not exists internal boolean not null default false;

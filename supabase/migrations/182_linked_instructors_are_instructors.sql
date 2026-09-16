-- An instructor whose profile still says 'student' is locked out of the portal:
-- /admin gates on profiles.role and bounces them, /dashboard lists enrollments
-- and they have none, so they read "You're signed in, but not enrolled on a
-- course yet." Erica Pacal hit this in Sept 2026; three others were in the same
-- loop and had not said anything.
--
-- The cause was that role promotion only ever lived on the link-clicking
-- sign-in routes, and sign-in moved to a typed code. The code path now promotes
-- too; this catches everyone who signed in before it did.
--
-- Keyed on the link, not on the email: two instructors are listed under a work
-- address but signed up with a personal one, and an email-matched backfill
-- would skip them.

update profiles p
set role = 'instructor'
from instructors i
where i.profile_id = p.id
  and p.role = 'student';

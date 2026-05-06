-- Nadav's auth email is nadav@peakinnovations.ngo — fix the instructor record
-- so the auto-link trigger and profile lookup both work for him
update instructors
set email = 'nadav@peakinnovations.ngo'
where slug = 'nadav-oakes';

-- Link all instructor records to existing profiles by matching auth.users.email.
-- Uses auth.users (which has the real sign-up email) instead of profiles.email
-- (which may not be populated). Only links where profile_id is not already set.
update public.instructors i
set profile_id = p.id
from auth.users u
join public.profiles p on p.id = u.id
where u.email = i.email
  and i.profile_id is null;

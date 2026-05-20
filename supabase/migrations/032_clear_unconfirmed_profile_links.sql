-- Migration 031 fixed the trigger so future invites don't prematurely set profile_id.
-- But instructors who were invited before the fix still have profile_id set even though
-- the linked auth user has never confirmed (invited_at IS NOT NULL, confirmed_at IS NULL).
-- Clear those links so they show as "Invited" rather than "Active".

update public.instructors i
set profile_id = null
from auth.users u
where u.id = i.profile_id
  and u.invited_at is not null
  and u.confirmed_at is null;

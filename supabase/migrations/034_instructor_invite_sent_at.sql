-- Replace fragile auth-user email matching with an explicit invite_sent_at column.
-- When adminSendInvite fires it sets this column; when the instructor confirms
-- and profile_id is linked, it gets cleared (they're now "active").

alter table public.instructors
  add column if not exists invite_sent_at timestamptz;

-- Best-effort backfill for instructors who were invited before this column existed:
-- match by email against unconfirmed auth users.
update public.instructors i
set invite_sent_at = u.invited_at
from auth.users u
where u.email = i.email
  and u.confirmed_at is null
  and i.profile_id is null
  and i.invite_sent_at is null
  and u.invited_at is not null;

-- Clear invite_sent_at when the instructor confirms (profile_id gets set).
create or replace function handle_user_confirmed()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.confirmed_at is not null and old.confirmed_at is null then
    update public.instructors
    set profile_id = new.id,
        invite_sent_at = null
    where email = new.email
      and profile_id is null;
  end if;
  return new;
end;
$$;

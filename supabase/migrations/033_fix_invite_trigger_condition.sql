-- Migration 031 checked `invited_at IS NULL` to skip linking for invited users.
-- But Supabase sets invited_at in a subsequent UPDATE, not on the initial INSERT —
-- so at INSERT time invited_at is always NULL and the check has no effect.
--
-- Fix: link profile_id immediately only when confirmed_at IS NOT NULL
-- (i.e. auto-confirmed direct signups). All other cases — invites and email-confirm
-- signups — are handled by handle_user_confirmed when confirmed_at is set.

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );

  if new.confirmed_at is not null then
    update public.instructors
    set profile_id = new.id
    where email = new.email
      and profile_id is null;
  end if;

  return new;
end;
$$;

-- Clear any profile_id links where the auth user has not yet confirmed,
-- including Levi Tate and any others caught by the old incorrect trigger.
update public.instructors i
set profile_id = null
from auth.users u
where u.id = i.profile_id
  and u.confirmed_at is null;

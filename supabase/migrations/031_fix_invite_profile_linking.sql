-- When inviteUserByEmail is called, Supabase creates an auth.users row immediately.
-- Our handle_new_user trigger was firing at that point and setting profile_id on
-- the instructor record — making them appear "Active" before accepting the invite.
--
-- Fix: only link profile_id when the user actually confirms (accepts the invite).
-- For normal signups (invited_at IS NULL), link immediately as before.

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

  -- For direct signups (not invite flow), link immediately
  if new.invited_at is null then
    update public.instructors
    set profile_id = new.id
    where email = new.email
      and profile_id is null;
  end if;

  return new;
end;
$$;

-- Link instructor when they accept their invite (confirmed_at goes from null → set)
create or replace function handle_user_confirmed()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.confirmed_at is not null and old.confirmed_at is null then
    update public.instructors
    set profile_id = new.id
    where email = new.email
      and profile_id is null;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_confirmed
  after update on auth.users
  for each row execute procedure handle_user_confirmed();

-- Clear Sean's premature profile_id link (invite was just sent, not accepted).
-- His profile row in auth/profiles stays intact — it'll be relinked on acceptance.
update public.instructors
set profile_id = null
where slug = 'sean-herlihy'
  and profile_id is not null;

-- 048 rewrote handle_new_user against the pre-002 schema: it inserts into
-- full_name, which 002 turned into a generated column — so the insert fails,
-- auth.users creation rolls back, and every invite/signup since dies with
-- "Database error saving new user". It also dropped 033's instructor linking.
--
-- Restore the cumulative shape: split name columns, email copied from auth
-- (what 048 was actually after), and the confirmed-only instructor link.

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name, avatar_url, email)
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'avatar_url',
    new.email
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

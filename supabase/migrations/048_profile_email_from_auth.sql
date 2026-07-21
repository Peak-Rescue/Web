-- profiles.email was added (008) after the handle_new_user trigger (001), so
-- new profiles were created without an email until the person typed one into
-- their contact form. Copy the auth email at signup and backfill the gaps.

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, email)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    new.email
  );
  return new;
end;
$$;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is null
  and u.email is not null;

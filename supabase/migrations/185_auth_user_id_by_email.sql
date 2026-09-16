-- Who owns an address, asked of the only table that decides it.
--
-- sendSignInCode resolves the typed address before minting a code, because
-- generateLink CREATES an account for an address it does not know — so the
-- lookup is the only thing standing between the public login form and an open
-- sign-up endpoint. It was asking profiles.email, which is the contact field:
-- free text, editable by the person, never synced to auth. Two instructors
-- have a contact address that is not an account at all, and typing one on the
-- login page would have passed the guard and minted a second, empty account
-- for them — the "signed in but nothing here" screen, from the other end.
--
-- Also replaces listing every auth user a page at a time, which was the
-- fallback for anyone predating profiles.email.

create or replace function public.auth_user_id_by_email(addr text)
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(addr) limit 1;
$$;

-- Server-side callers only. This answers "does this address have an account",
-- which is exactly the question the login form refuses to answer out loud.
revoke execute on function public.auth_user_id_by_email(text) from public;
revoke execute on function public.auth_user_id_by_email(text) from anon;
revoke execute on function public.auth_user_id_by_email(text) from authenticated;
grant execute on function public.auth_user_id_by_email(text) to service_role;

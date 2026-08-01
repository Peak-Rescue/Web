-- The keep-alive GitHub workflow pinged instructors with the anon key; 079
-- revoked that read, so the ping now fails with 401. Give it a purpose-built
-- function that exercises Postgres without exposing any data.

create or replace function public.keep_alive()
returns text
language sql
stable
as $$ select 'ok' $$;

revoke all on function public.keep_alive() from public;
grant execute on function public.keep_alive() to anon;

-- 076 guessed the wrong names for these two (they are prefixed
-- "contact_submissions:", not "contact:"), so they still carry the recursive
-- inline profiles check. Same fix, correct names.

drop policy if exists "contact: admin read" on public.contact_submissions;
drop policy if exists "contact: admin update" on public.contact_submissions;

drop policy if exists "contact_submissions: admin read" on public.contact_submissions;
create policy "contact_submissions: admin read"
  on public.contact_submissions for select
  using (public.is_admin());

drop policy if exists "contact_submissions: admin update" on public.contact_submissions;
create policy "contact_submissions: admin update"
  on public.contact_submissions for update
  using (public.is_admin());

-- 076 left signed-in non-staff (students) able to read rows for anyone shown
-- on the public team page — including their email addresses. No browser-side
-- code reads this table at all (every public and portal view goes through the
-- service-role client), so the backstop can be staff-only.

drop policy if exists "instructors: staff read" on public.instructors;
create policy "instructors: staff read"
  on public.instructors for select
  to authenticated
  using (public.is_staff());

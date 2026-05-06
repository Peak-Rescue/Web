-- Create a security-definer helper that checks admin role without triggering
-- RLS recursion. Runs as the function owner (bypasses RLS on profiles).

create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

-- Rewrite all policies that inline the admin check to use the helper instead.

-- instructor_capabilities
drop policy if exists "capabilities: admin full access" on instructor_capabilities;
create policy "capabilities: admin full access"
  on instructor_capabilities for all
  using     (is_admin())
  with check(is_admin());

-- instructors
drop policy if exists "instructors: admin write"  on instructors;
drop policy if exists "instructors: admin update" on instructors;
drop policy if exists "instructors: admin delete" on instructors;

create policy "instructors: admin write"
  on instructors for insert
  with check (is_admin());

create policy "instructors: admin update"
  on instructors for update
  using (is_admin());

create policy "instructors: admin delete"
  on instructors for delete
  using (is_admin());

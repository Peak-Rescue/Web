-- Add explicit WITH CHECK to the admin capabilities policy so upsert works
-- correctly via the browser client (anon key + user JWT).

drop policy if exists "capabilities: admin full access" on instructor_capabilities;

create policy "capabilities: admin full access"
  on instructor_capabilities for all
  using     (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check(exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- Who an update is for.
--
-- Until now every update went to everyone, which forced a crew-only notice
-- ("gear check moved to 0600, don't tell the students yet") out of the updates
-- box and into course_messages — trading away the one thing updates are for,
-- that a correction reaches everybody who already read the wrong version.
--
-- Same three values as course_messages.audience, and they mean the same thing,
-- with one addition: on an update the audience also decides who can *see* it.
-- Emailing only the crew while the words sit on the page a student is reading
-- would be a worse kind of wrong than not sending it at all.
alter table public.course_updates
  add column audience text not null default 'everyone'
    check (audience in ('students', 'instructors', 'everyone'));

-- Staff still read every update. A student reads the ones addressed to them —
-- the portal filters this as well (it reads with the service role), but the
-- rule belongs here too so a crew-only note can't leak through some other
-- reader later.
drop policy if exists "course_updates: course read" on public.course_updates;
create policy "course_updates: course read"
  on public.course_updates for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.instance_instructors ii
      join public.instructors i on i.id = ii.instructor_id
      where ii.instance_id = course_updates.instance_id
        and i.profile_id = auth.uid()
    )
    or (
      course_updates.audience in ('students', 'everyone')
      and exists (
        select 1 from public.enrollments e
        where e.instance_id = course_updates.instance_id and e.user_id = auth.uid()
      )
    )
  );

-- The old calculator's leftovers.
--
-- Before 195, the pay suggestion wrote two lines for a whole course —
-- "Field days — 3 × 5 days @ 500" and "Travel days — 3 × 2 days @ 200" —
-- one figure for the entire crew at a flat day rate. Those lines are both
-- superseded and wrong: they miss overtime, they price a mixed crew at one
-- person's rate, and they charge the course for days a salaried person's
-- salary already covered. A course that has been reconciled since has them
-- sitting under the new per-person lines, adding a second copy of the same
-- week to the pay total.
--
-- So they go. Narrowly: only lines whose description is exactly what that
-- code generated, which nobody types by hand, and only where the row still
-- looks machine-written — nobody attached, no hours, no date.
--
-- Not on a closed course. Those books were read and signed off against the
-- number they held, and quietly taking money out of them is the one thing
-- worse than leaving a stale line visible. The count is raised instead, so
-- the courses that need a human are named rather than silently changed.

do $$
declare
  legacy constant text := '^(Field|Travel) days — [0-9]+ × [0-9]+ days? @ [0-9.]+$';
  open_count int;
  closed_count int;
begin
  select count(*) into closed_count
  from public.course_pay_items p
  join public.course_actuals a on a.instance_id = p.instance_id
  where a.closed_at is not null
    and p.instructor_id is null and p.profile_id is null
    and p.hours is null and p.work_date is null
    and p.description ~ legacy;

  with gone as (
    delete from public.course_pay_items p
    where p.instructor_id is null and p.profile_id is null
      and p.hours is null and p.work_date is null
      and p.description ~ legacy
      and not exists (
        select 1 from public.course_actuals a
        where a.instance_id = p.instance_id and a.closed_at is not null
      )
    returning 1
  )
  select count(*) into open_count from gone;

  raise notice 'Removed % whole-crew pay line(s) from open courses.', open_count;
  if closed_count > 0 then
    raise notice '% left in place on closed courses — those books were signed off against them.', closed_count;
  end if;
end $$;

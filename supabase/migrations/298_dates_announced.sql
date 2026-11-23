-- The dates the crew were last told about, kept apart from the dates on the
-- course.
--
-- Moving a course's dates emailed everyone on it on every save, and the date
-- painter saves as you let go — so working out the new week by dragging sent
-- one "New dates" email per drag. The dates still save as you go; the email
-- waits until an admin says the dates are settled. While the two pairs
-- differ, the course page asks whether to tell the crew; dragging back to
-- where they started makes them agree again and the question goes away.
--
-- Every course on the books counts as announced as it stands, and a new
-- course starts out announced: nobody is on it yet to be told anything, and
-- whoever is staffed later hears the dates in their assignment email.

alter table public.course_instances
  add column if not exists dates_announced_starts_at date,
  add column if not exists dates_announced_ends_at date;

update public.course_instances
set dates_announced_starts_at = starts_at,
    dates_announced_ends_at = ends_at;

create or replace function public.course_dates_announced_on_insert() returns trigger
language plpgsql as $$
begin
  new.dates_announced_starts_at := new.starts_at;
  new.dates_announced_ends_at := new.ends_at;
  return new;
end $$;

drop trigger if exists course_dates_announced_on_insert on public.course_instances;
create trigger course_dates_announced_on_insert
  before insert on public.course_instances
  for each row execute procedure public.course_dates_announced_on_insert();

-- Tasks no longer have due dates; anything date-critical goes in the notes.
-- Fold existing due dates into notes so nothing is lost, then drop the column.

update public.course_tasks
  set notes = case
    when notes is null or notes = '' then 'Due ' || to_char(due_date, 'Mon FMDD, YYYY')
    else notes || e'\n' || 'Due ' || to_char(due_date, 'Mon FMDD, YYYY')
  end
  where due_date is not null
  and status = 'open';

alter table public.course_tasks drop column due_date;

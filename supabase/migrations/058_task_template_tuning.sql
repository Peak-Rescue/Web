-- Template tuning per Nadav: four tasks aren't universal → suggestions;
-- two aren't tracked here at all → retired. Untouched copies seeded onto
-- courses are cleaned up; anything assigned/noted/dated/documented stays.

update public.course_task_templates
  set default_line = false
  where title in (
    'Gear order placed',
    'Student lodging booked',
    'Rental vehicles reserved',
    'Invoice sent / payment received'
  );

update public.course_task_templates
  set active = false
  where title in (
    'Course expendables stocked',
    'Instructor payroll submitted'
  );

delete from public.course_tasks ct
using public.course_task_templates t
where ct.title = t.title
  and (not t.default_line or not t.active)
  and ct.status = 'open'
  and ct.assigned_to is null
  and ct.notes is null
  and ct.due_date is null
  and not exists (
    select 1 from public.course_task_documents d where d.task_id = ct.id
  );

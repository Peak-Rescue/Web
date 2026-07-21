-- One-time restructure of existing courses to the default/suggested task
-- split: active courses gain any missing default-line tasks, and untouched
-- situational template tasks (open, unassigned, no notes/dates/documents)
-- are removed — anything someone touched is kept.

insert into public.course_tasks (instance_id, title, sort_order)
select ci.id, t.title, t.sort_order
from public.course_instances ci
cross join public.course_task_templates t
where t.active
  and t.default_line
  and ci.status in ('tentative', 'quoted', 'confirmed')
  and not exists (
    select 1 from public.course_tasks ct
    where ct.instance_id = ci.id and ct.title = t.title
  );

delete from public.course_tasks ct
using public.course_task_templates t
where ct.title = t.title
  and not t.default_line
  and ct.status = 'open'
  and ct.assigned_to is null
  and ct.notes is null
  and ct.due_date is null
  and not exists (
    select 1 from public.course_task_documents d where d.task_id = ct.id
  );

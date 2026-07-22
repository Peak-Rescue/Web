-- Rename the "Contract / SOW signed" checklist item to plainer wording,
-- both in the standard template and on any existing course tasks.

update public.course_task_templates
  set title = 'Scope of work defined'
  where title = 'Contract / SOW signed';

update public.course_tasks
  set title = 'Scope of work defined'
  where title = 'Contract / SOW signed';

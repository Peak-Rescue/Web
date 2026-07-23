-- Courses moved to the assigned-only task model: templates are no longer
-- auto-seeded onto new courses (they're offered in the bulk-add picker
-- instead), and existing untouched unassigned rows are removed.
-- Applied directly on 2026-07-23; kept here as the paper trail.

delete from public.course_tasks ct
where ct.status = 'open'
  and ct.assigned_to is null
  and ct.notes is null
  and not exists (
    select 1 from public.course_task_documents d where d.task_id = ct.id
  );
